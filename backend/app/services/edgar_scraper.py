
import httpx
import asyncio
import re
from bs4 import BeautifulSoup
import structlog

logger = structlog.get_logger()

class EdgarScraper:
    def __init__(self):
        self.headers = {
            "User-Agent": "EnergyIntelligenceEngine research@energy.com",
            "Accept": "application/json, text/html",
        }
        self.base = "https://efts.sec.gov/LATEST/search-index"
        self.filing_base = "https://www.sec.gov"

    async def search_filings(self, query: str, max_results: int = 20, filing_types: list = None, date_from: str = "2020-01-01"):
        if filing_types is None:
            filing_types = ["10-K", "8-K", "S-1"]

        forms = "%2C".join(filing_types)
        url = f"{self.base}?q={query}&dateRange=custom&startdt={date_from}&forms={forms}&from=0"
        
        logger.info("edgar_search", query=query, url=url)

        async with httpx.AsyncClient(headers=self.headers, timeout=30) as client:
            try:
                r = await client.get(url)
                data = r.json()
                hits = data.get("hits", {}).get("hits", [])
                logger.info("edgar_page", fetched=len(hits), total=data.get("hits", {}).get("total", {}).get("value", 0))
                
                results = []
                for h in hits[:max_results]:
                    src = h.get("_source", {})
                    adsh = src.get("adsh", "")
                    ciks = src.get("ciks", [""])
                    cik = ciks[0] if ciks else ""
                    names = src.get("display_names", [""])
                    name = names[0].split("(")[0].strip() if names else ""
                    
                    # Build the actual document URL
                    adsh_path = adsh.replace("-", "")
                    index_url = f"{self.filing_base}/Archives/edgar/data/{cik.lstrip('0')}/{adsh_path}/{adsh}-index.htm"
                    
                    results.append({
                        "entity_name": name,
                        "cik": cik.lstrip("0"),
                        "accession_no": adsh,
                        "form_type": src.get("form", ""),
                        "filed_at": src.get("file_date", ""),
                        "index_url": index_url,
                        "document_url": "",
                    })
                return results
            except Exception as e:
                logger.error("edgar_search_error", error=str(e))
                return []

    async def fetch_filing_index(self, filing: dict) -> str:
        """Open the filing index page and get the actual document text"""
        async with httpx.AsyncClient(headers=self.headers, timeout=60, follow_redirects=True) as client:
            try:
                # First get the index page to find the main document
                index_url = filing.get("index_url", "")
                if not index_url:
                    return ""
                
                r = await client.get(index_url)
                soup = BeautifulSoup(r.text, "lxml")
                
                # Find the main document link (10-K, 8-K etc)
                doc_url = ""
                for a in soup.find_all("a", href=True):
                    href = a["href"]
                    if any(href.endswith(ext) for ext in [".htm", ".html", ".txt"]):
                        if not any(x in href.lower() for x in ["ex-", "exhibit", "xsd", "xml"]):
                            doc_url = self.filing_base + href if href.startswith("/") else href
                            break
                
                if not doc_url:
                    return ""
                
                filing["document_url"] = doc_url
                logger.info("fetching_document", url=doc_url)
                
                # Fetch the actual document
                r2 = await client.get(doc_url)
                soup2 = BeautifulSoup(r2.text, "lxml")
                
                # Extract text
                for tag in soup2(["script", "style", "head"]):
                    tag.decompose()
                
                text = soup2.get_text(separator=" ", strip=True)
                # Limit to 8000 chars for LLM
                return text[:8000]
                
            except Exception as e:
                logger.error("fetch_doc_error", error=str(e), url=filing.get("index_url", ""))
                return ""

RENEWABLE_KEYWORDS = [
    'solar energy project',
    'wind farm energy project',
    'battery energy storage',
    'ERCOT solar wind Texas',
    'MISO renewable energy',
    'offshore wind project',
    'photovoltaic energy project',
    'renewable energy interconnection',
    'green energy project financing',
    'clean energy project approval',
    'hydropower energy project',
    'geothermal energy project',
]
