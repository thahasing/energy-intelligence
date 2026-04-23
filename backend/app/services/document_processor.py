"""
Document Processing Service
Extracts and cleans text from HTML filings and PDF documents.
Splits text into semantic chunks for LLM processing.
"""
import re
import io
from typing import List, Dict, Optional, Tuple
from pathlib import Path
import structlog
from bs4 import BeautifulSoup

logger = structlog.get_logger(__name__)

# Chunk size for LLM context windows
CHUNK_SIZE = 3000       # characters per chunk
CHUNK_OVERLAP = 400     # overlap between chunks


class DocumentProcessor:
    """
    Processes raw HTML and PDF documents into clean text chunks
    suitable for LLM extraction.
    """

    # ─── HTML Processing ───────────────────────────────────
    def extract_text_from_html(self, html: str) -> Tuple[str, List[Dict]]:
        """
        Parse HTML filing and extract clean text with paragraph metadata.
        Returns (full_text, list of paragraphs with metadata).
        """
        soup = BeautifulSoup(html, "lxml")

        # Remove noise elements
        for tag in soup(["script", "style", "nav", "header", "footer",
                          "meta", "link", "noscript", "form"]):
            tag.decompose()

        paragraphs = []
        para_idx = 0

        # Process semantic elements in order
        for element in soup.find_all(["p", "div", "td", "li", "h1", "h2", "h3", "h4", "span"]):
            text = element.get_text(separator=" ", strip=True)
            text = self._clean_text(text)
            if len(text) > 40:  # Skip trivially short fragments
                paragraphs.append({
                    "paragraph_number": para_idx,
                    "text": text,
                    "tag": element.name,
                    "length": len(text),
                })
                para_idx += 1

        full_text = "\n\n".join(p["text"] for p in paragraphs)
        return full_text, paragraphs

    # ─── PDF Processing ────────────────────────────────────
    def extract_text_from_pdf(self, pdf_path: str) -> Tuple[str, List[Dict]]:
        """
        Extract text from PDF with page and line metadata.
        Returns (full_text, list of page dicts).
        """
        pages = []
        full_text_parts = []

        try:
            import fitz  # PyMuPDF
            doc = fitz.open(pdf_path)

            for page_num in range(len(doc)):
                page = doc[page_num]
                page_text = page.get_text("text")
                page_text = self._clean_text(page_text)

                if page_text.strip():
                    # Extract blocks with coordinates for line tracking
                    blocks = page.get_text("blocks")
                    page_blocks = []
                    line_num = 0

                    for block in blocks:
                        if len(block) >= 5:
                            block_text = self._clean_text(block[4])
                            if len(block_text) > 20:
                                lines = block_text.split("\n")
                                for line in lines:
                                    line = line.strip()
                                    if len(line) > 10:
                                        page_blocks.append({
                                            "line_number": line_num,
                                            "text": line,
                                            "bbox": block[:4],
                                        })
                                        line_num += 1

                    pages.append({
                        "page_number": page_num + 1,
                        "text": page_text,
                        "blocks": page_blocks,
                        "char_count": len(page_text),
                    })
                    full_text_parts.append(page_text)

            doc.close()

        except Exception as e:
            logger.warning("pymupdf_failed", error=str(e), path=pdf_path)
            # Fallback to pdfplumber
            try:
                import pdfplumber
                with pdfplumber.open(pdf_path) as pdf:
                    for page_num, page in enumerate(pdf.pages):
                        page_text = page.extract_text() or ""
                        page_text = self._clean_text(page_text)
                        if page_text.strip():
                            pages.append({
                                "page_number": page_num + 1,
                                "text": page_text,
                                "blocks": [],
                                "char_count": len(page_text),
                            })
                            full_text_parts.append(page_text)
            except Exception as e2:
                logger.error("pdf_extract_failed", error=str(e2), path=pdf_path)

        full_text = "\n\n--- PAGE BREAK ---\n\n".join(full_text_parts)
        return full_text, pages

    # ─── Text Chunking ─────────────────────────────────────
    def chunk_text(
        self,
        text: str,
        chunk_size: int = CHUNK_SIZE,
        overlap: int = CHUNK_OVERLAP,
    ) -> List[Dict]:
        """
        Split text into overlapping semantic chunks.
        Attempts to split on sentence/paragraph boundaries.
        """
        if not text or not text.strip():
            return []

        chunks = []
        chunk_id = 0

        # Split on double-newlines first (paragraph boundary)
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]

        current_chunk = ""
        current_start_para = 0

        for para_idx, para in enumerate(paragraphs):
            # If adding this paragraph would exceed chunk size
            if len(current_chunk) + len(para) + 2 > chunk_size and current_chunk:
                chunks.append({
                    "chunk_id": chunk_id,
                    "text": current_chunk.strip(),
                    "char_count": len(current_chunk),
                    "start_paragraph": current_start_para,
                    "end_paragraph": para_idx - 1,
                })
                chunk_id += 1

                # Overlap: keep last N characters
                overlap_text = current_chunk[-overlap:] if len(current_chunk) > overlap else current_chunk
                current_chunk = overlap_text + "\n\n" + para
                current_start_para = max(0, para_idx - 1)
            else:
                if current_chunk:
                    current_chunk += "\n\n" + para
                else:
                    current_chunk = para
                    current_start_para = para_idx

        # Final chunk
        if current_chunk.strip():
            chunks.append({
                "chunk_id": chunk_id,
                "text": current_chunk.strip(),
                "char_count": len(current_chunk),
                "start_paragraph": current_start_para,
                "end_paragraph": len(paragraphs) - 1,
            })

        return chunks

    def chunk_pages(self, pages: List[Dict]) -> List[Dict]:
        """
        Create chunks from PDF pages, preserving page number metadata.
        """
        chunks = []
        chunk_id = 0

        for page in pages:
            page_chunks = self.chunk_text(page["text"])
            for c in page_chunks:
                c["page_number"] = page["page_number"]
                c["chunk_id"] = chunk_id
                chunk_id += 1
                chunks.append(c)

        return chunks

    # ─── Relevance Filtering ───────────────────────────────
    def filter_relevant_chunks(self, chunks: List[Dict]) -> List[Dict]:
        """
        Return only chunks likely to contain energy project information.
        Filters by keyword presence.
        """
        ENERGY_KEYWORDS = [
            r"\b(solar|photovoltaic|pv)\b",
            r"\b(wind\s*(farm|energy|power|project|turbine))\b",
            r"\b(battery\s*storage|energy\s*storage|bess)\b",
            r"\b(renewable\s*energy)\b",
            r"\b(power\s*plant|generating\s*facility|generating\s*station)\b",
            r"\b(mw|megawatt|gwh|kwh)\b",
            r"\b(environmental\s*(approval|permit|assessment|impact))\b",
            r"\b(grid\s*(connection|interconnection))\b",
            r"\b(project\s*(finance|financing|funded))\b",
            r"\b(construction\s*(permit|approval|commenced|completion))\b",
            r"\b(operational|commercial\s*operation|cod)\b",
        ]

        patterns = [re.compile(kw, re.IGNORECASE) for kw in ENERGY_KEYWORDS]
        relevant = []

        for chunk in chunks:
            text = chunk.get("text", "")
            score = sum(1 for p in patterns if p.search(text))
            if score >= 1:
                chunk["relevance_score"] = score
                relevant.append(chunk)

        # Sort by relevance
        relevant.sort(key=lambda x: x.get("relevance_score", 0), reverse=True)
        return relevant

    # ─── Snippet Extraction ────────────────────────────────
    def find_snippet_in_text(
        self,
        field_value: str,
        full_text: str,
        pages: List[Dict],
        window: int = 200,
    ) -> Optional[Dict]:
        """
        Locate where a field_value appears in the document.
        Returns metadata: page_number, line_start, exact_snippet, context.
        """
        if not field_value or not full_text:
            return None

        # Try exact match first
        idx = full_text.lower().find(field_value.lower()[:50])
        if idx == -1:
            # Try fuzzy: just first meaningful words
            words = field_value.split()[:4]
            query = " ".join(words)
            idx = full_text.lower().find(query.lower())

        if idx == -1:
            return None

        # Extract context window around match
        start = max(0, idx - window)
        end = min(len(full_text), idx + len(field_value) + window)
        snippet = full_text[idx:min(len(full_text), idx + 200)]
        context = full_text[start:end]

        # Find page number
        page_num = None
        char_count = 0
        for page in pages:
            char_count += page.get("char_count", 0)
            if char_count >= idx:
                page_num = page.get("page_number")
                break

        # Estimate line number
        lines_before = full_text[:idx].count("\n")

        return {
            "page_number": page_num,
            "line_start": lines_before,
            "line_end": lines_before + snippet.count("\n") + 1,
            "exact_snippet": snippet.strip()[:500],
            "snippet_context": context.strip()[:1000],
        }

    # ─── Utilities ─────────────────────────────────────────
    def _clean_text(self, text: str) -> str:
        """Normalize whitespace, remove non-printable chars."""
        if not text:
            return ""
        # Normalize whitespace
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        # Remove null bytes and control chars
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
        # Normalize unicode dashes/quotes
        text = text.replace("\u2019", "'").replace("\u2018", "'")
        text = text.replace("\u201c", '"').replace("\u201d", '"')
        text = text.replace("\u2013", "-").replace("\u2014", "-")
        return text.strip()

    def get_summary_stats(self, text: str) -> Dict:
        """Return basic stats about extracted text."""
        return {
            "char_count": len(text),
            "word_count": len(text.split()),
            "line_count": text.count("\n"),
            "has_mw_mentions": bool(re.search(r"\b\d+\s*mw\b", text, re.I)),
            "has_location_mentions": bool(re.search(
                r"\b(california|texas|nevada|arizona|florida|new york|colorado|oregon|washington|utah|new mexico)\b",
                text, re.I
            )),
        }
