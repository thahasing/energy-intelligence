
import asyncio
import httpx
import json
import uuid
from bs4 import BeautifulSoup
import structlog
from sqlalchemy import select

logger = structlog.get_logger()

HEADERS = {"User-Agent": "EnergyIntelligenceEngine research@energy.com"}

async def search_edgar(query, max_results=20, filing_types=None, date_from="2020-01-01"):
    if filing_types is None:
        filing_types = ["10-K", "8-K", "S-1"]
    forms = ",".join(filing_types)
    params = {
        "q": query,
        "dateRange": "custom",
        "startdt": date_from,
        "forms": forms,
        "from": 0,
    }
    url = "https://efts.sec.gov/LATEST/search-index"
    logger.info("edgar_search", query=query, url=url)
    async with httpx.AsyncClient(headers=HEADERS, timeout=30) as client:
        r = await client.get(url, params=params)
        r.raise_for_status()
        hits = r.json().get("hits", {}).get("hits", [])
        logger.info("edgar_page", fetched=len(hits))
        results = []
        for h in hits[:max_results]:
            src = h.get("_source", {})
            adsh = src.get("adsh", "")
            ciks = src.get("ciks", ["0"])
            cik = ciks[0].lstrip("0") if ciks else "0"
            names = src.get("display_names", ["Unknown"])
            name = names[0].split("(")[0].strip() if names else "Unknown"
            adsh_path = adsh.replace("-", "")
            index_url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{adsh_path}/{adsh}-index.htm"
            results.append({
                "name": name,
                "cik": cik,
                "adsh": adsh,
                "form": src.get("form",""),
                "filed_date": src.get("file_date") or src.get("filedAt"),
                "index_url": index_url,
            })
        return results

async def fetch_text(index_url):
    async with httpx.AsyncClient(headers=HEADERS, timeout=60, follow_redirects=True) as client:
        try:
            r = await client.get(index_url)
            soup = BeautifulSoup(r.text, "lxml")
            doc_url = ""
            for a in soup.find_all("a", href=True):
                href = a["href"]
                if any(href.endswith(x) for x in [".htm", ".html", ".txt"]):
                    if not any(x in href.lower() for x in ["ex-", "exhibit", "xsd", "xml"]):
                        doc_url = "https://www.sec.gov" + href if href.startswith("/") else href
                        break
            if not doc_url:
                return "", ""
            r2 = await client.get(doc_url)
            soup2 = BeautifulSoup(r2.text, "lxml")
            for tag in soup2(["script","style","head"]):
                tag.decompose()
            return soup2.get_text(separator=" ", strip=True)[:6000], doc_url
        except Exception as e:
            logger.error("fetch_error", error=str(e))
            return "", ""

def extract_with_ollama(text, company):
    """Extract projects using Groq LLM instead of Ollama"""
    import httpx, json, os
    groq_key = os.environ.get("GROQ_API_KEY", "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")
    prompt = f"""Extract renewable energy projects from this SEC filing by {company}.
Return ONLY a valid JSON array with no extra text. Each item must have these exact fields:
- project_name: string (specific project name, not company name)
- project_type: string (must be one of: solar, wind, battery, hydro)
- owner_company: string
- state: string (2-letter US state code or country name)
- capacity_mw: number or null
- lifecycle_stage: string (one of: planned, approved, under_construction, operational)
- environmental_approval: boolean
- grid_connection_approval: boolean
- financing_secured: boolean

Only include real renewable energy projects with specific names mentioned in the text.
If no projects found, return empty array [].

SEC Filing text:
{text[:4000]}

Return only the JSON array, nothing else."""

    try:
        r = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
            json={"model": "llama-3.3-70b-versatile", "messages": [{"role": "user", "content": prompt}], "temperature": 0.1, "max_tokens": 2000},
            timeout=30
        )
        result = r.json()
        raw = result["choices"][0]["message"]["content"].strip()
        # Clean up markdown code blocks if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()
        projects = json.loads(raw)
        if isinstance(projects, list):
            return projects
        return []
    except Exception as e:
        import structlog
        structlog.get_logger().error("groq_error", error=str(e))
        return []


