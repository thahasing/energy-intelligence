
import asyncio, httpx, ollama, json, uuid, sys
sys.path.insert(0, '/Users/thahasingandluri/Downloads/energy-intelligence 2/backend')
from bs4 import BeautifulSoup
from app.models.database import AsyncSessionLocal, Project, Document
from sqlalchemy import select
from datetime import datetime

HEADERS = {'User-Agent': 'EnergyIntelligenceEngine research@energy.com'}
GENERIC = ['solar project','wind project','wind farm','battery project','renewable energy','energy project','solar farm','hydro project','solar plant','wind plant']
QUERIES = [
    'ERCOT solar wind Texas interconnection',
    'MISO renewable energy Midwest interconnection',
    'solar farm megawatt capacity Texas',
    'wind energy project megawatt interconnection',
    'battery storage BESS megawatt grid Texas',
    'photovoltaic solar project MW capacity',
    'offshore wind project megawatt capacity',
    'renewable energy project environmental approval',
]

async def search_edgar(query, max_results=5):
    url = f'https://efts.sec.gov/LATEST/search-index?q={query}&dateRange=custom&startdt=2020-01-01&forms=10-K,8-K,S-1&from=0'
    async with httpx.AsyncClient(headers=HEADERS, timeout=30) as c:
        r = await c.get(url)
        hits = r.json().get('hits',{}).get('hits',[])
        results = []
        for h in hits[:max_results]:
            src = h.get('_source',{})
            adsh = src.get('adsh','')
            cik = (src.get('ciks',['0'])[0]).lstrip('0')
            name = (src.get('display_names',['Unknown'])[0]).split('(')[0].strip()
            adsh_path = adsh.replace('-','')
            index_url = f'https://www.sec.gov/Archives/edgar/data/{cik}/{adsh_path}/{adsh}-index.htm'
            results.append({'name':name,'cik':cik,'adsh':adsh,'form':src.get('form',''),'filed':src.get('file_date',''),'index_url':index_url})
        return results

async def fetch_text(index_url):
    async with httpx.AsyncClient(headers=HEADERS, timeout=60, follow_redirects=True) as c:
        try:
            r = await c.get(index_url)
            if 'index.htm' not in r.url.path and '/Archives/' not in str(r.url):
                print(f'  Redirected to wrong page: {r.url}')
                return '',''
            soup = BeautifulSoup(r.text,'lxml')
            doc_url = ''
            for a in soup.find_all('a',href=True):
                href = a['href']
                if any(href.endswith(x) for x in ['.htm','.html','.txt']):
                    if not any(x in href.lower() for x in ['ex-','exhibit','xsd','xml','def14','proxy']):
                        full = 'https://www.sec.gov'+href if href.startswith('/') else href
                        if '/Archives/edgar/' in full:
                            doc_url = full
                            break
            if not doc_url:
                print(f'  No valid doc URL found in {index_url}')
                return '',''
            print(f'  Reading: {doc_url}')
            r2 = await c.get(doc_url)
            soup2 = BeautifulSoup(r2.text,'lxml')
            for tag in soup2(['script','style','head']):
                tag.decompose()
            return soup2.get_text(separator=' ',strip=True)[:6000], doc_url
        except Exception as e:
            print(f'  Fetch error: {e}')
            return '',''

def extract(text, company):
    prompt = f'''Extract renewable energy projects from SEC filing by {company}.
Return ONLY a JSON array. Each item needs:
project_name (specific real name not generic),
project_type (solar/wind/battery/hydro/geothermal),
owner_company, city, state (2-letter US code), capacity_mw (number or null),
lifecycle_stage (planned/approved/under_construction/operational),
environmental_approval (true/false/null),
grid_connection_approval (true/false/null),
financing_secured (true/false/null),
source_text (exact quote from doc proving project exists max 150 chars)
Only real named projects. Return [] if none found.
Text: {text[:4000]}'''
    try:
        r = ollama.chat(model='llama3.2', messages=[{'role':'user','content':prompt}])
        raw = r['message']['content']
        s,e = raw.find('['), raw.rfind(']')+1
        if s >= 0 and e > s:
            return json.loads(raw[s:e])
        return []
    except Exception as ex:
        print(f'  Ollama error: {ex}')
        return []

async def project_exists(db, name):
    r = await db.execute(select(Project).where(Project.project_name_normalized == name.lower().strip()))
    return r.scalar_one_or_none() is not None

async def save_doc(db, filing, doc_url, text):
    try:
        r = await db.execute(select(Document).where(Document.url == doc_url))
        ex = r.scalar_one_or_none()
        if ex:
            return ex.id
        doc = Document(
            id=uuid.uuid4(), url=doc_url,
            filing_type=filing['form'], company_name=filing['name'],
            cik=filing['cik'], accession_number=filing['adsh'],
            filed_date=datetime.strptime(filing['filed'],'%Y-%m-%d').date() if filing.get('filed') else None,
            raw_text=text[:10000], status='processed',
            ingested_at=datetime.utcnow(), processed_at=datetime.utcnow(),
        )
        db.add(doc)
        await db.flush()
        return doc.id
    except Exception as e:
        print(f'  Doc error: {e}')
        return None

async def save_proj(db, proj, filing, doc_id):
    name = str(proj.get('project_name') or '').strip()
    if not name or len(name) < 5:
        return False
    if name.lower() in GENERIC:
        return False
    if await project_exists(db, name):
        print(f'  SKIP duplicate: {name}')
        return False
    try:
        cap = proj.get('capacity_mw')
        if cap is not None:
            try: cap = float(str(cap).replace(',','').replace('MW','').strip())
            except: cap = None
        p = Project(
            id=uuid.uuid4(),
            project_name=name[:200],
            project_name_normalized=name.lower().strip(),
            project_type=str(proj.get('project_type') or 'unknown').lower(),
            owner_company=str(proj.get('owner_company') or filing['name']),
            city=str(proj.get('city') or '') or None,
            state=str(proj.get('state') or '') or None,
            country='USA', capacity_mw=cap,
            lifecycle_stage=str(proj.get('lifecycle_stage') or 'unknown').lower(),
            environmental_approval=proj.get('environmental_approval'),
            grid_connection_approval=proj.get('grid_connection_approval'),
            financing_secured=proj.get('financing_secured'),
            overall_confidence=0.82, document_id=doc_id,
        )
        db.add(p)
        await db.commit()
        print(f'  SAVED: {name} | {p.project_type} | {p.state} | {cap} MW')
        return True
    except Exception as e:
        print(f'  Save error: {e}')
        await db.rollback()
        return False

async def main():
    total = 0
    async with AsyncSessionLocal() as db:
        for q in QUERIES:
            print(f'Searching: {q}')
            filings = await search_edgar(q, 5)
            for filing in filings:
                print(f'Processing: {filing["name"]}')
                text, doc_url = await fetch_text(filing['index_url'])
                if not text:
                    continue
                doc_id = await save_doc(db, filing, doc_url, text)
                projects = extract(text, filing['name'])
                print(f'  Extracted {len(projects)} projects')
                for proj in projects:
                    if await save_proj(db, proj, filing, doc_id):
                        total += 1
    print(f'DONE! Saved {total} new unique projects!')
    print('Refresh localhost:3001!')

asyncio.run(main())
