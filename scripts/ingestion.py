#!/usr/bin/env python3
"""
Standalone ingestion script.
Run directly without the FastAPI server to populate the database.

Usage:
    python scripts/ingestion.py --query "solar energy project" --max-docs 20
    python scripts/ingestion.py --all-keywords --max-per-keyword 10
    python scripts/ingestion.py --setup-db
"""
import asyncio
import argparse
import sys
import os

# Add backend to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

import structlog
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
from rich.table import Table
from rich.panel import Panel

from app.services.edgar_scraper import EdgarScraper, RENEWABLE_KEYWORDS
from app.services.document_processor import DocumentProcessor
from app.services.llm_extractor import LLMExtractionEngine
from app.services.geolocation import GeoLocationService
from app.models.database import engine, Base

console = Console()


async def setup_database():
    """Create all tables if they do not exist."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    console.print("[green]Database schema ready[/green]")


async def run_ingestion(
    query: str,
    max_documents: int = 20,
    filing_types: list = None,
    date_from: str = "2020-01-01",
    verbose: bool = False,
):
    """Run the full extraction pipeline for a given search query."""
    if filing_types is None:
        filing_types = ["10-K", "8-K", "S-1"]

    scraper   = EdgarScraper()
    processor = DocumentProcessor()
    extractor = LLMExtractionEngine()
    geo       = GeoLocationService()

    console.print(Panel(
        f"[bold green]Energy Intelligence Engine[/bold green]\n"
        f"Query    : [cyan]{query}[/cyan]\n"
        f"Max docs : [yellow]{max_documents}[/yellow]  "
        f"Types: [yellow]{', '.join(filing_types)}[/yellow]",
        title="Ingestion Starting",
    ))

    summary = {"filings": 0, "docs": 0, "projects": 0, "errors": 0}
    projects_found = []

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        console=console,
    ) as progress:

        # ── Search ──────────────────────────────────────
        t_search = progress.add_task("[cyan]Searching SEC EDGAR...", total=1)
        filings = await scraper.search_filings(
            query=query,
            filing_types=filing_types,
            date_from=date_from,
            max_results=max_documents,
        )
        summary["filings"] = len(filings)
        progress.update(t_search, completed=1,
                        description=f"[cyan]Found {len(filings)} filings")

        if not filings:
            console.print("[yellow]No filings found.[/yellow]")
            return summary

        # ── Process each filing ─────────────────────────
        t_proc = progress.add_task("[yellow]Processing filings...", total=len(filings))

        for filing in filings:
            cik       = filing.get("cik", "")
            accession = filing.get("accession_no", "")
            company   = filing.get("entity_name", "Unknown")

            progress.update(t_proc,
                            description=f"[yellow]{company[:40]}...")

            if not cik or not accession:
                progress.advance(t_proc)
                continue

            try:
                # Fetch filing index
                index = await scraper.fetch_filing_index(accession, cik)
                if not index or not index.get("documents"):
                    progress.advance(t_proc)
                    continue

                primary_doc = index["documents"][0] if index["documents"] else None
                if not primary_doc:
                    progress.advance(t_proc)
                    continue

                doc_url = primary_doc.get("url", "")
                if not doc_url:
                    progress.advance(t_proc)
                    continue

                # Fetch HTML content
                html, final_url = await scraper.fetch_document_html(doc_url)
                if not html:
                    summary["errors"] += 1
                    progress.advance(t_proc)
                    continue

                # Extract text
                full_text, paragraphs = processor.extract_text_from_html(html)
                if len(full_text.strip()) < 100:
                    progress.advance(t_proc)
                    continue

                # Chunk + filter for relevance
                chunks   = processor.chunk_text(full_text)
                relevant = processor.filter_relevant_chunks(chunks)

                if not relevant:
                    summary["docs"] += 1
                    progress.advance(t_proc)
                    continue

                # LLM extraction
                raw_results = await extractor.batch_extract(
                    relevant[:15],
                    final_url or doc_url,
                )

                for item in raw_results:
                    extraction = item["extraction"]
                    if not extraction.project_name:
                        continue

                    # Geocode location
                    lat, lon, loc_conf = await geo.geocode(
                        city=extraction.city,
                        state=extraction.state,
                        country=extraction.country or "USA",
                        project_name=extraction.project_name,
                    )

                    projects_found.append({
                        "name":             extraction.project_name,
                        "type":             extraction.project_type or "?",
                        "owner":            extraction.owner_company or "?",
                        "city":             extraction.city or "",
                        "state":            extraction.state or "",
                        "lat":              lat,
                        "lon":              lon,
                        "capacity_mw":      extraction.capacity_mw,
                        "lifecycle":        extraction.lifecycle_stage or "?",
                        "env_approval":     extraction.environmental_approval,
                        "grid_approval":    extraction.grid_connection_approval,
                        "financing":        extraction.financing_secured,
                        "financing_amount": extraction.financing_amount_usd,
                        "source_url":       final_url or doc_url,
                        "company":          company,
                        "filed":            filing.get("filed_at", "")[:10],
                    })
                    summary["projects"] += 1

                summary["docs"] += 1

            except Exception as exc:
                summary["errors"] += 1
                if verbose:
                    console.print(f"[red]  Error ({company}): {exc}[/red]")

            progress.advance(t_proc)

    # ── Results table ─────────────────────────────────
    if projects_found:
        tbl = Table(
            title=f"\nExtracted Projects ({len(projects_found)})",
            header_style="bold green",
            border_style="green",
            show_lines=False,
        )
        tbl.add_column("Project",    max_width=35)
        tbl.add_column("Type",       max_width=10, style="cyan")
        tbl.add_column("Owner",      max_width=22, style="dim white")
        tbl.add_column("Location",   max_width=14, style="yellow")
        tbl.add_column("MW",         max_width=8,  style="green")
        tbl.add_column("Lifecycle",  max_width=16, style="blue")
        tbl.add_column("Env",        max_width=4)
        tbl.add_column("Grid",       max_width=4)
        tbl.add_column("Fin",        max_width=4)

        for p in projects_found[:60]:
            env  = "✓" if p["env_approval"]  else ("✗" if p["env_approval"]  is False else "?")
            grid = "✓" if p["grid_approval"] else ("✗" if p["grid_approval"] is False else "?")
            fin  = "✓" if p["financing"]     else ("✗" if p["financing"]     is False else "?")
            cap  = f"{p['capacity_mw']}" if p["capacity_mw"] else "—"
            loc  = f"{p['city']}, {p['state']}".strip(", ") or "?"
            tbl.add_row(
                p["name"][:35],
                p["type"][:10],
                p["owner"][:22],
                loc[:14],
                cap,
                p["lifecycle"].replace("_", " ")[:16],
                env, grid, fin,
            )
        console.print(tbl)
    else:
        console.print("[yellow]No energy projects extracted.[/yellow]")

    # ── Summary ───────────────────────────────────────
    console.print(Panel(
        f"[bold]Filings searched :[/bold] {summary['filings']}\n"
        f"[bold]Docs processed  :[/bold] {summary['docs']}\n"
        f"[bold green]Projects found  :[/bold green] [bold]{summary['projects']}[/bold]\n"
        f"[bold red]Errors          :[/bold red] {summary['errors']}",
        title="[bold green]Ingestion Complete[/bold green]",
        border_style="green",
    ))

    return summary


async def run_all_keywords(max_per_keyword: int = 5):
    """Run ingestion across all predefined renewable energy keyword sets."""
    console.print(f"[bold]Running {len(RENEWABLE_KEYWORDS)} keyword categories[/bold]\n")
    total = 0
    for kw in RENEWABLE_KEYWORDS:
        console.rule(f"[cyan]{kw}[/cyan]")
        result = await run_ingestion(kw, max_documents=max_per_keyword)
        total += result["projects"]
    console.print(f"\n[bold green]Grand total projects: {total}[/bold green]")


def main():
    parser = argparse.ArgumentParser(
        description="Energy Project Intelligence Engine — CLI Ingestion",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python ingestion.py --query 'solar farm' --max-docs 30\n"
            "  python ingestion.py --all-keywords --max-per-keyword 8\n"
            "  python ingestion.py --setup-db\n"
        ),
    )
    parser.add_argument("--query",            type=str,   help="Search query")
    parser.add_argument("--max-docs",         type=int,   default=20)
    parser.add_argument("--types",            nargs="+",  default=["10-K","8-K","S-1"])
    parser.add_argument("--date-from",        default="2020-01-01")
    parser.add_argument("--all-keywords",     action="store_true")
    parser.add_argument("--max-per-keyword",  type=int,   default=5)
    parser.add_argument("--setup-db",         action="store_true")
    parser.add_argument("--verbose",          action="store_true")

    args = parser.parse_args()

    async def run():
        await setup_database()
        if args.setup_db:
            return
        if args.all_keywords:
            await run_all_keywords(args.max_per_keyword)
        elif args.query:
            await run_ingestion(
                query=args.query,
                max_documents=args.max_docs,
                filing_types=args.types,
                date_from=args.date_from,
                verbose=args.verbose,
            )
        else:
            parser.print_help()

    asyncio.run(run())


if __name__ == "__main__":
    main()
