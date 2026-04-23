"""
RAG Service - Vector store and chunk-to-answer mapping.
Uses FAISS for similarity search and OpenAI embeddings.
"""
import asyncio
import hashlib
import json
import pickle
from pathlib import Path
from typing import List, Dict, Optional, Tuple
import numpy as np
import structlog
from openai import AsyncOpenAI

from app.config import settings

logger = structlog.get_logger(__name__)

VECTOR_STORE_PATH = Path("/tmp/energy_faiss_index")
EMBEDDING_DIM = 1536  # text-embedding-3-small


class RAGService:
    """
    Manages FAISS vector index for document chunks.
    Supports:
    - Adding chunks with metadata
    - Semantic similarity search
    - Chunk-to-field attribution
    """

    def __init__(self):
        self._client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self._index = None
        self._chunks: List[Dict] = []
        self._embedding_cache: Dict[str, List[float]] = {}
        self._initialized = False

    def _ensure_faiss(self):
        """Lazy-load FAISS index."""
        if self._index is None:
            try:
                import faiss
                self._index = faiss.IndexFlatIP(EMBEDDING_DIM)  # Inner product (cosine with normalized vecs)
                self._faiss = faiss
                self._initialized = True
            except ImportError:
                logger.warning("faiss_not_available", msg="Using fallback cosine search")
                self._initialized = False

    async def get_embedding(self, text: str) -> Optional[List[float]]:
        """Get embedding for text, using cache if available."""
        text_hash = hashlib.md5(text[:500].encode()).hexdigest()

        if text_hash in self._embedding_cache:
            return self._embedding_cache[text_hash]

        try:
            resp = await self._client.embeddings.create(
                model=settings.OPENAI_EMBEDDING_MODEL,
                input=text[:8000],
            )
            embedding = resp.data[0].embedding
            self._embedding_cache[text_hash] = embedding
            return embedding
        except Exception as e:
            logger.error("embedding_error", error=str(e))
            return None

    async def add_chunks(self, chunks: List[Dict], document_url: str, document_id: str = None):
        """
        Add document chunks to the vector index.
        Each chunk must have 'text' and optionally 'page_number', 'chunk_id'.
        """
        self._ensure_faiss()

        texts = [c["text"] for c in chunks if c.get("text")]
        if not texts:
            return

        # Batch embeddings
        embeddings = await asyncio.gather(*[self.get_embedding(t) for t in texts])

        valid_pairs = [
            (emb, chunk)
            for emb, chunk in zip(embeddings, chunks)
            if emb is not None
        ]

        if not valid_pairs:
            return

        emb_matrix = np.array([p[0] for p in valid_pairs], dtype=np.float32)

        # Normalize for cosine similarity
        norms = np.linalg.norm(emb_matrix, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1, norms)
        emb_matrix = emb_matrix / norms

        if self._initialized:
            self._index.add(emb_matrix)

        start_idx = len(self._chunks)
        for i, (_, chunk) in enumerate(valid_pairs):
            self._chunks.append({
                **chunk,
                "document_url": document_url,
                "document_id": document_id,
                "vector_idx": start_idx + i,
            })

        logger.info("rag_chunks_added", count=len(valid_pairs), total=len(self._chunks))

    async def search(
        self,
        query: str,
        top_k: int = 5,
        document_url: Optional[str] = None,
    ) -> List[Dict]:
        """
        Find most relevant chunks for a query.
        Optionally filter by document_url.
        """
        self._ensure_faiss()

        if not self._chunks:
            return []

        query_emb = await self.get_embedding(query)
        if query_emb is None:
            return []

        query_vec = np.array([query_emb], dtype=np.float32)
        query_vec = query_vec / (np.linalg.norm(query_vec) + 1e-8)

        if self._initialized and self._index.ntotal > 0:
            scores, indices = self._index.search(query_vec, min(top_k * 2, self._index.ntotal))
            results = []
            for score, idx in zip(scores[0], indices[0]):
                if idx < 0 or idx >= len(self._chunks):
                    continue
                chunk = self._chunks[idx].copy()
                chunk["similarity_score"] = float(score)
                if document_url and chunk.get("document_url") != document_url:
                    continue
                results.append(chunk)
            return results[:top_k]
        else:
            # Fallback: linear cosine search
            return self._linear_search(query_vec[0], top_k, document_url)

    def _linear_search(
        self,
        query_vec: np.ndarray,
        top_k: int,
        document_url: Optional[str],
    ) -> List[Dict]:
        """Linear cosine similarity search fallback."""
        if not self._embedding_cache:
            return []

        scores = []
        for i, chunk in enumerate(self._chunks):
            text = chunk.get("text", "")
            text_hash = hashlib.md5(text[:500].encode()).hexdigest()
            if text_hash not in self._embedding_cache:
                continue
            emb = np.array(self._embedding_cache[text_hash])
            emb = emb / (np.linalg.norm(emb) + 1e-8)
            score = float(np.dot(query_vec, emb))
            if document_url is None or chunk.get("document_url") == document_url:
                scores.append((score, i))

        scores.sort(reverse=True)
        results = []
        for score, idx in scores[:top_k]:
            chunk = self._chunks[idx].copy()
            chunk["similarity_score"] = score
            results.append(chunk)
        return results

    async def find_source_for_field(
        self,
        field_name: str,
        field_value: str,
        document_url: str,
    ) -> Optional[Dict]:
        """
        Find the document chunk that best supports a specific field extraction.
        Used for source traceability.
        """
        if not field_value:
            return None

        # Search for the specific value in context
        query = f"{field_name}: {field_value}"
        results = await self.search(query, top_k=3, document_url=document_url)

        if results:
            return results[0]
        return None

    def save_index(self, path: str = None):
        """Persist index to disk."""
        path = path or str(VECTOR_STORE_PATH)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        try:
            if self._initialized:
                import faiss
                faiss.write_index(self._index, f"{path}.faiss")
            with open(f"{path}.chunks.pkl", "wb") as f:
                pickle.dump(self._chunks, f)
            with open(f"{path}.cache.pkl", "wb") as f:
                pickle.dump(self._embedding_cache, f)
            logger.info("rag_index_saved", path=path)
        except Exception as e:
            logger.error("rag_save_error", error=str(e))

    def load_index(self, path: str = None):
        """Load index from disk."""
        path = path or str(VECTOR_STORE_PATH)
        self._ensure_faiss()
        try:
            if Path(f"{path}.faiss").exists():
                import faiss
                self._index = faiss.read_index(f"{path}.faiss")
            if Path(f"{path}.chunks.pkl").exists():
                with open(f"{path}.chunks.pkl", "rb") as f:
                    self._chunks = pickle.load(f)
            if Path(f"{path}.cache.pkl").exists():
                with open(f"{path}.cache.pkl", "rb") as f:
                    self._embedding_cache = pickle.load(f)
            logger.info("rag_index_loaded", chunks=len(self._chunks))
        except Exception as e:
            logger.error("rag_load_error", error=str(e))


# Singleton instance
rag_service = RAGService()
