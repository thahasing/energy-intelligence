
import asyncio
import httpx
import json
import uuid
from bs4 import BeautifulSoup
import structlog

logger = structlog.get_logger()

HEADERS = {"User-Agent": "EnergyIntelligenceEngine research@energy.com"}

async def search_edgar(query, max_results=20, filing_types=None, date_from="2020-01-01"):
    if filing_types is None:
        filing_types = ["10-K", "8-K", "S-1"]
    forms = ",".join(filing_types)
    url = f"https://efts.sec.gov/LATEST/search-index?q={query}&dateRange=custom&startdt={date_from}&forms={forms}&from=0"
    logger.info("edgar_search", query=query, url=url)
    async with httpx.AsyncClient(headers=HEADERS, timeout=30) as client:
        r = await client.get(url)
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
            results.append({"name": name, "cik": cik, "adsh": adsh, "form": src.get("form",""), "index_url": index_url})
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
    try:
        import ollama
        prompt = f"""Extract renewable energy projects from this SEC filing by {company}.
Return ONLY a JSON array. Each item must have:
project_name, project_type (solar/wind/battery/hydro), owner_company,
city, state, capacity_mw (number or null), lifecycle_stage (planned/approved/under_construction/operational),
environmental_approval (true/false/null), grid_connection_approval (true/false/null),
financing_secured (true/false/null)

If no projects found return [].
Text: {text[:4000]}"""
        r = ollama.chat(model="llama3.2", messages=[{"role":"user","content":prompt}])
        raw = r["message"]["content"]
        start, end = raw.find("["), raw.rfind("]")+1
        if start >= 0 and end > start:
            return json.loads(raw[start:end])
        return []
    except Exception as e:
        logger.error("ollama_error", error=str(e))
        return []

async def run_ingestion(db, job_id, query, max_documents=20, filing_types=None, date_from="2020-01-01"):
    from app.models.database import Project, IngestionJob
    from datetime import datetime

    # Update job status
    job = await db.get(IngestionJob, job_id)
    if job:
        job.status = "running"
        job.started_at = datetime.utcnow()
        await db.commit()

    try:
        filings = await search_edgar(query, max_documents, filing_types, date_from)
        
        if job:
            job.total_documents = len(filings)
            await db.commit()

        projects_found = 0
        for i, filing in enumerate(filings):
            text, doc_url = await fetch_text(filing["index_url"])
            if not text:
                if job:
                    job.processed_documents = i + 1
                    await db.commit()
                continue

            projects = extract_with_ollama(text, filing["name"])
            
            for proj in projects:
                if not proj.get("project_name"):
                    continue
                try:
                    p = Project(
                        id=uuid.uuid4(),
                        project_name=str(proj.get("project_name") or filing["name"])[:200],
                        project_type=str(proj.get("project_type") or "unknown").lower(),
                        owner_company=str(proj.get("owner_company") or filing["name"]),
                        city=str(proj.get("city") or "") or None,
                        state=str(proj.get("state") or "") or None,
                        country="USA",
                        capacity_mw=float(proj["capacity_mw"]) if proj.get("capacity_mw") else None,
                        lifecycle_stage=str(proj.get("lifecycle_stage") or "unknown").lower(),
                        environmental_approval=proj.get("environmental_approval"),
                        grid_connection_approval=proj.get("grid_connection_approval"),
                        financing_secured=proj.get("financing_secured"),
                        overall_confidence=0.75,
                    )
                    db.add(p)
                    await db.commit()
                    projects_found += 1
                    logger.info("project_saved", name=p.project_name, type=p.project_type)
                except Exception as e:
                    logger.error("save_error", error=str(e))
                    await db.rollback()

            if job:
                job.processed_documents = i + 1
                job.projects_found = projects_found
                await db.commit()

        if job:
            job.status = "done"
            job.projects_found = projects_found
            from datetime import datetime
            job.completed_at = datetime.utcnow()
            await db.commit()

        return projects_found

    except Exception as e:
        if job:
            job.status = "failed"
            job.error_message = str(e)
            await db.commit()
        raise e


class IngestionPipeline:
    async def run(self, db, job_id, query, max_documents=20, filing_types=None, date_from="2020-01-01", date_to=None, **kwargs):
        return await run_ingestion(db, job_id, query, max_documents, filing_types, date_from)
