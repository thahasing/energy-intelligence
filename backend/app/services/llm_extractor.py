"""
AI Extraction Engine
Uses OpenAI GPT to extract structured energy project data from document chunks.
Implements source traceability and confidence scoring.
"""
import json
import re
import asyncio
from typing import List, Dict, Optional, Any
from openai import AsyncOpenAI
import structlog

from app.config import settings
from app.models.schemas import LLMExtractionResult

logger = structlog.get_logger(__name__)

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

# ─── Extraction Prompt ─────────────────────────────────────
EXTRACTION_SYSTEM_PROMPT = """You are an expert energy project analyst specializing in extracting structured data from SEC EDGAR filings and regulatory documents.

Your task is to extract energy project information from the provided text. You must:
1. Return ONLY valid JSON — no preamble, no markdown, no explanation
2. Extract ONLY what is explicitly stated — do not invent data
3. For each field, provide the exact verbatim snippet from the text that supports your answer
4. Assign confidence scores from 0.0 to 1.0 for each extracted field

FIELD DEFINITIONS:
- project_name: The official name of the specific energy project (e.g. "Sunflower Solar Farm", "Desert Wind Project")
- project_type: ONLY one of: solar, wind, battery, hydro, geothermal, hybrid, unknown
- owner_company: Legal entity that owns or is developing the project
- city: City or nearest municipality
- state: US state abbreviation (e.g. "CA", "TX")
- country: Country (default "USA" if US context)
- latitude: Decimal degrees if explicitly stated (null if not found)
- longitude: Decimal degrees if explicitly stated (null if not found)
- capacity_mw: Numeric capacity in MW (extract number only, e.g. 150.5)
- lifecycle_stage: ONLY one of: planned, approved, under_construction, operational, decommissioned, unknown
- environmental_approval: true/false/null (true if explicitly approved, false if explicitly denied, null if not mentioned)
- environmental_approval_date: ISO date string if mentioned (YYYY-MM-DD)
- grid_connection_approval: true/false/null
- financing_secured: true/false/null
- financing_amount_usd: Integer dollar amount if mentioned (e.g. 500000000 for $500M)
- financing_details: Brief description of financing terms

RESPONSE FORMAT — return exactly this JSON structure:
{
  "project_name": "...",
  "project_type": "...",
  "owner_company": "...",
  "city": "...",
  "state": "...",
  "country": "USA",
  "latitude": null,
  "longitude": null,
  "capacity_mw": null,
  "lifecycle_stage": "...",
  "environmental_approval": null,
  "environmental_approval_date": null,
  "grid_connection_approval": null,
  "financing_secured": null,
  "financing_amount_usd": null,
  "financing_details": null,
  "confidence_scores": {
    "project_name": 0.0,
    "project_type": 0.0,
    "owner_company": 0.0,
    "city": 0.0,
    "state": 0.0,
    "capacity_mw": 0.0,
    "lifecycle_stage": 0.0,
    "environmental_approval": 0.0,
    "grid_connection_approval": 0.0,
    "financing_secured": 0.0
  },
  "source_snippets": {
    "project_name": "exact verbatim text from document",
    "project_type": "exact verbatim text from document",
    "owner_company": "exact verbatim text from document",
    "city": "exact verbatim text from document",
    "state": "exact verbatim text from document",
    "capacity_mw": "exact verbatim text from document",
    "lifecycle_stage": "exact verbatim text from document",
    "environmental_approval": "exact verbatim text from document",
    "grid_connection_approval": "exact verbatim text from document",
    "financing_secured": "exact verbatim text from document",
    "financing_amount_usd": "exact verbatim text from document"
  }
}"""

MULTI_PROJECT_PROMPT = """This document may describe MULTIPLE energy projects. 
Extract ALL projects found. Return a JSON array where each element is a project object with the same schema.
If only one project is found, return a single-element array.
If no projects are found, return an empty array []."""

COMPARISON_SYSTEM_PROMPT = """You are an expert at analyzing renewable energy project data.
You will be given two or more project records that have the same name but may or may not be the same project.

Analyze the records and:
1. Determine if they represent the same project (same physical installation) or different projects
2. Identify the key differences or similarities
3. Provide a clear human-readable explanation

Return ONLY valid JSON:
{
  "is_same_project": true/false,
  "similarity_score": 0.0-1.0,
  "explanation": "Clear description of differences/similarities",
  "key_differences": ["difference 1", "difference 2"],
  "recommendation": "brief recommendation on how to treat these records"
}"""

LIFECYCLE_PREDICTION_PROMPT = """You are an expert in renewable energy project development.
Given the following project data, predict the current lifecycle stage and estimate project timeline.

Return ONLY valid JSON:
{
  "predicted_lifecycle_stage": "planned|approved|under_construction|operational|decommissioned|unknown",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "estimated_cod": "estimated commercial operation date as YYYY or YYYY-MM if possible, null otherwise",
  "risk_factors": ["factor 1", "factor 2"]
}"""


class LLMExtractionEngine:
    """
    Orchestrates LLM-based extraction of structured project data.
    Supports batching, retry logic, and source traceability.
    """

    def __init__(self):
        self._semaphore = asyncio.Semaphore(5)  # Limit concurrent LLM calls

    async def extract_projects_from_chunk(
        self,
        chunk_text: str,
        document_url: str,
        chunk_metadata: Dict,
        multi_project: bool = True,
    ) -> List[LLMExtractionResult]:
        """
        Extract all energy projects from a single text chunk.
        Returns list of LLMExtractionResult objects.
        """
        prompt = MULTI_PROJECT_PROMPT if multi_project else ""
        user_content = f"""Extract energy project data from this SEC filing text.
Document URL: {document_url}
{prompt}

--- TEXT START ---
{chunk_text[:4000]}
--- TEXT END ---"""

        async with self._semaphore:
            for attempt in range(3):
                try:
                    response = await client.chat.completions.create(
                        model=settings.OPENAI_MODEL,
                        messages=[
                            {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                            {"role": "user", "content": user_content},
                        ],
                        temperature=0.1,
                        max_tokens=2000,
                        response_format={"type": "json_object"} if not multi_project else None,
                    )

                    raw = response.choices[0].message.content
                    return self._parse_extraction_response(raw, multi_project)

                except Exception as e:
                    logger.warning("llm_extraction_retry", attempt=attempt, error=str(e))
                    if attempt < 2:
                        await asyncio.sleep(2 ** attempt)
                    else:
                        logger.error("llm_extraction_failed", error=str(e))
                        return []

        return []

    def _parse_extraction_response(
        self,
        raw: str,
        multi_project: bool,
    ) -> List[LLMExtractionResult]:
        """Parse LLM JSON response into LLMExtractionResult objects."""
        if not raw:
            return []

        # Strip markdown fences if present
        raw = re.sub(r"```json\s*", "", raw)
        raw = re.sub(r"```\s*", "", raw)
        raw = raw.strip()

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error("json_parse_error", error=str(e), raw=raw[:200])
            return []

        results = []

        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            # Check if it contains a list of projects
            for key in ["projects", "results", "items"]:
                if key in data and isinstance(data[key], list):
                    items = data[key]
                    break
            else:
                items = [data]
        else:
            return []

        for item in items:
            if not isinstance(item, dict):
                continue
            # Skip empty/no-project results
            if not item.get("project_name"):
                continue
            try:
                result = LLMExtractionResult(
                    project_name=item.get("project_name"),
                    project_type=self._normalize_project_type(item.get("project_type")),
                    owner_company=item.get("owner_company"),
                    city=item.get("city"),
                    state=item.get("state"),
                    country=item.get("country", "USA"),
                    latitude=self._parse_float(item.get("latitude")),
                    longitude=self._parse_float(item.get("longitude")),
                    capacity_mw=self._parse_float(item.get("capacity_mw")),
                    lifecycle_stage=self._normalize_lifecycle(item.get("lifecycle_stage")),
                    environmental_approval=item.get("environmental_approval"),
                    environmental_approval_date=item.get("environmental_approval_date"),
                    grid_connection_approval=item.get("grid_connection_approval"),
                    financing_secured=item.get("financing_secured"),
                    financing_amount_usd=self._parse_int(item.get("financing_amount_usd")),
                    financing_details=item.get("financing_details"),
                    confidence_scores=item.get("confidence_scores", {}),
                    source_snippets=item.get("source_snippets", {}),
                )
                results.append(result)
            except Exception as e:
                logger.warning("result_parse_error", error=str(e))
                continue

        return results

    async def batch_extract(
        self,
        chunks: List[Dict],
        document_url: str,
        batch_size: int = 5,
    ) -> List[Dict]:
        """
        Process multiple chunks in batches.
        Returns deduplicated list of project dicts with chunk metadata.
        """
        all_results = []
        batches = [chunks[i:i+batch_size] for i in range(0, len(chunks), batch_size)]

        for batch in batches:
            tasks = [
                self.extract_projects_from_chunk(
                    chunk["text"],
                    document_url,
                    chunk,
                )
                for chunk in batch
            ]
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)

            for chunk, results in zip(batch, batch_results):
                if isinstance(results, Exception):
                    logger.error("batch_extract_error", error=str(results))
                    continue
                for result in results:
                    all_results.append({
                        "extraction": result,
                        "chunk": chunk,
                        "document_url": document_url,
                    })

        return all_results

    async def compare_project_variants(
        self,
        projects: List[Dict],
    ) -> Dict:
        """
        Use LLM to analyze whether multiple same-named projects are actually the same.
        """
        prompt = f"""Compare these {len(projects)} energy project records with the same name:

{json.dumps(projects, indent=2, default=str)[:3000]}

Determine if they are the same physical project or different projects."""

        try:
            response = await client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": COMPARISON_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,
                max_tokens=800,
            )
            raw = response.choices[0].message.content
            raw = re.sub(r"```json\s*|```\s*", "", raw).strip()
            return json.loads(raw)
        except Exception as e:
            logger.error("comparison_failed", error=str(e))
            return {
                "is_same_project": None,
                "similarity_score": 0.5,
                "explanation": "Could not perform automated comparison",
                "key_differences": [],
                "recommendation": "Manual review required",
            }

    async def predict_lifecycle(self, project_data: Dict) -> Dict:
        """
        Predict lifecycle stage using LLM based on available project signals.
        """
        prompt = f"""Analyze this renewable energy project and predict its lifecycle stage:

{json.dumps(project_data, indent=2, default=str)[:2000]}"""

        try:
            response = await client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": LIFECYCLE_PREDICTION_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.2,
                max_tokens=600,
            )
            raw = response.choices[0].message.content
            raw = re.sub(r"```json\s*|```\s*", "", raw).strip()
            return json.loads(raw)
        except Exception as e:
            logger.error("lifecycle_prediction_failed", error=str(e))
            return {
                "predicted_lifecycle_stage": "unknown",
                "confidence": 0.0,
                "reasoning": "Prediction failed",
            }

    # ─── Helpers ───────────────────────────────────────────
    def _normalize_project_type(self, raw: Optional[str]) -> Optional[str]:
        if not raw:
            return None
        raw = raw.lower().strip()
        mapping = {
            "solar": "solar", "pv": "solar", "photovoltaic": "solar",
            "wind": "wind", "wind farm": "wind", "offshore wind": "wind",
            "battery": "battery", "bess": "battery", "storage": "battery",
            "hydro": "hydro", "hydroelectric": "hydro",
            "geothermal": "geothermal",
            "hybrid": "hybrid",
        }
        for key, val in mapping.items():
            if key in raw:
                return val
        return "unknown"

    def _normalize_lifecycle(self, raw: Optional[str]) -> Optional[str]:
        if not raw:
            return None
        raw = raw.lower().strip().replace(" ", "_")
        valid = {"planned", "approved", "under_construction", "operational", "decommissioned", "unknown"}
        if raw in valid:
            return raw
        if "construct" in raw:
            return "under_construction"
        if "operat" in raw:
            return "operational"
        if "approv" in raw:
            return "approved"
        if "plan" in raw:
            return "planned"
        return "unknown"

    def _parse_float(self, val: Any) -> Optional[float]:
        if val is None:
            return None
        try:
            return float(val)
        except (ValueError, TypeError):
            return None

    def _parse_int(self, val: Any) -> Optional[int]:
        if val is None:
            return None
        try:
            if isinstance(val, str):
                val = re.sub(r"[,$\s]", "", val)
                # Handle M/B suffixes
                if val.upper().endswith("B"):
                    return int(float(val[:-1]) * 1_000_000_000)
                if val.upper().endswith("M"):
                    return int(float(val[:-1]) * 1_000_000)
            return int(float(val))
        except (ValueError, TypeError):
            return None
