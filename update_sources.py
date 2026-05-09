#!/usr/bin/env python3
"""
Update existing source URLs to use index URLs instead of document URLs.
"""
import asyncio
import sys
import os

# Add backend to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from app.models.database import get_db, SourceReference, Document
from sqlalchemy import select, update

async def update_source_urls():
    async for db in get_db():
        # Get all source references with their document info
        query = select(SourceReference, Document.cik, Document.accession_number).join(Document, SourceReference.document_id == Document.id)
        result = await db.execute(query)
        rows = result.all()

        updates = []
        for src_ref, cik, accession in rows:
            if not cik or not accession:
                continue
            # Reconstruct index URL
            adsh = accession
            adsh_path = adsh.replace("-", "")
            index_url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{adsh_path}/{adsh}-index.htm"
            if src_ref.source_url != index_url:
                updates.append((src_ref.id, index_url))

        # Update in batches
        if updates:
            for ref_id, new_url in updates:
                await db.execute(
                    update(SourceReference).where(SourceReference.id == ref_id).values(source_url=new_url)
                )
            await db.commit()
            print(f"Updated {len(updates)} source URLs")
        else:
            print("No updates needed")

if __name__ == "__main__":
    asyncio.run(update_source_urls())