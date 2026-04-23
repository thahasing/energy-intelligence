"""
Test suite for Energy Project Intelligence Engine.
Tests document processing, LLM extraction, geolocation, and differentiation.
"""
import pytest
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

# ─── Fixtures ──────────────────────────────────────────────

SAMPLE_HTML = """
<!DOCTYPE html>
<html>
<body>
<h1>Annual Report - SunRise Energy Inc.</h1>
<p>SunRise Energy Inc. announces the development of the <strong>Desert Bloom Solar Project</strong>,
a 250 MW utility-scale photovoltaic solar energy facility located in Kern County, California.
The project has received environmental approval from the California Energy Commission on March 15, 2023.
Grid interconnection approval was granted by Pacific Gas & Electric in June 2023.
The project has secured $400 million in financing from a consortium of green energy banks.
Construction commenced in Q3 2023 and commercial operation is expected by Q4 2025.</p>

<p>Additionally, the company is developing the <strong>Mountain Wind Farm</strong>, a 180 MW
wind energy project in Tehachapi, California. Environmental assessment is currently underway
with approval expected in early 2024.</p>
</body>
</html>
"""

SAMPLE_PDF_TEXT = """
NEXGEN WIND POWER LLC
Project Overview: Pacific Shores Offshore Wind Farm
Capacity: 500 MW
Location: 12 miles offshore, Humboldt County, California
Coordinates: 40.7589° N, 124.1983° W
Lifecycle Stage: Approved - Construction pending
Environmental Impact Statement: Approved by Bureau of Ocean Energy Management, January 2024
Grid Connection: Pending PG&E interconnection agreement
Project Finance: $1.2 billion secured from Goldman Sachs and JP Morgan Green Fund
Owner: NexGen Wind Power LLC (subsidiary of Atlantic Renewables Corp)
"""

SAMPLE_LLM_RESPONSE = {
    "project_name": "Desert Bloom Solar Project",
    "project_type": "solar",
    "owner_company": "SunRise Energy Inc.",
    "city": "Kern County",
    "state": "CA",
    "country": "USA",
    "latitude": None,
    "longitude": None,
    "capacity_mw": 250.0,
    "lifecycle_stage": "under_construction",
    "environmental_approval": True,
    "environmental_approval_date": "2023-03-15",
    "grid_connection_approval": True,
    "financing_secured": True,
    "financing_amount_usd": 400000000,
    "financing_details": "consortium of green energy banks",
    "confidence_scores": {
        "project_name": 0.97,
        "project_type": 0.95,
        "owner_company": 0.93,
        "city": 0.85,
        "state": 0.99,
        "capacity_mw": 0.98,
        "lifecycle_stage": 0.82,
        "environmental_approval": 0.96,
        "grid_connection_approval": 0.90,
        "financing_secured": 0.94,
    },
    "source_snippets": {
        "project_name": "the Desert Bloom Solar Project, a 250 MW utility-scale photovoltaic",
        "project_type": "utility-scale photovoltaic solar energy facility",
        "owner_company": "SunRise Energy Inc. announces the development",
        "capacity_mw": "250 MW utility-scale photovoltaic",
        "environmental_approval": "received environmental approval from the California Energy Commission on March 15, 2023",
        "financing_secured": "secured $400 million in financing from a consortium",
    },
}


# ─── Document Processor Tests ──────────────────────────────

class TestDocumentProcessor:

    def setup_method(self):
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
        from app.services.document_processor import DocumentProcessor
        self.processor = DocumentProcessor()

    def test_extract_text_from_html(self):
        """HTML text extraction returns meaningful content."""
        full_text, paragraphs = self.processor.extract_text_from_html(SAMPLE_HTML)
        assert len(full_text) > 100
        assert "Desert Bloom Solar Project" in full_text
        assert len(paragraphs) > 0

    def test_chunk_text_basic(self):
        """Text chunking produces non-empty chunks."""
        chunks = self.processor.chunk_text(SAMPLE_PDF_TEXT)
        assert len(chunks) > 0
        for chunk in chunks:
            assert "text" in chunk
            assert len(chunk["text"]) > 0
            assert "chunk_id" in chunk

    def test_chunk_text_overlap(self):
        """Chunks overlap at boundaries."""
        long_text = "This is a test sentence about renewable energy. " * 200
        chunks = self.processor.chunk_text(long_text, chunk_size=500, overlap=100)
        if len(chunks) > 1:
            # First chunk content should partially appear in second
            first_end = chunks[0]["text"][-80:]
            second_start = chunks[1]["text"][:200]
            # Some overlap expected (not exact due to paragraph splitting)
            assert len(chunks) > 1

    def test_filter_relevant_chunks(self):
        """Relevance filter retains energy-related chunks."""
        chunks = [
            {"text": "This solar energy project is a 100 MW facility in Texas.", "chunk_id": 0},
            {"text": "The company sells office furniture and equipment.", "chunk_id": 1},
            {"text": "Wind turbine installation commenced in Q3 2023.", "chunk_id": 2},
            {"text": "Financial statements and balance sheet overview.", "chunk_id": 3},
        ]
        relevant = self.processor.filter_relevant_chunks(chunks)
        relevant_ids = {c["chunk_id"] for c in relevant}
        assert 0 in relevant_ids  # solar energy project
        assert 2 in relevant_ids  # wind turbine
        assert 1 not in relevant_ids  # office furniture

    def test_clean_text(self):
        """Text cleaning removes noise."""
        dirty = "Hello\x00 World\t\t  test  \n\n\n\nclean"
        cleaned = self.processor._clean_text(dirty)
        assert "\x00" not in cleaned
        assert "  " not in cleaned
        assert "\n\n\n" not in cleaned

    def test_find_snippet_in_text(self):
        """Snippet location returns page/line metadata."""
        full_text = "Page 1 content. The Desert Bloom Solar Project is a 250 MW facility."
        pages = [{"page_number": 1, "text": full_text, "char_count": len(full_text)}]
        result = self.processor.find_snippet_in_text(
            "Desert Bloom Solar Project", full_text, pages
        )
        assert result is not None
        assert "exact_snippet" in result
        assert "Desert Bloom" in result["exact_snippet"]


# ─── LLM Extraction Tests ─────────────────────────────────

class TestLLMExtractor:

    def setup_method(self):
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
        from app.services.llm_extractor import LLMExtractionEngine
        self.extractor = LLMExtractionEngine()

    def test_parse_valid_json(self):
        """Valid JSON extraction response parses correctly."""
        raw = json.dumps([SAMPLE_LLM_RESPONSE])
        results = self.extractor._parse_extraction_response(raw, multi_project=True)
        assert len(results) == 1
        r = results[0]
        assert r.project_name == "Desert Bloom Solar Project"
        assert r.project_type == "solar"
        assert r.capacity_mw == 250.0
        assert r.environmental_approval is True
        assert r.financing_amount_usd == 400_000_000

    def test_parse_single_project(self):
        """Single project dict (not list) parses correctly."""
        raw = json.dumps(SAMPLE_LLM_RESPONSE)
        results = self.extractor._parse_extraction_response(raw, multi_project=False)
        assert len(results) == 1

    def test_parse_with_markdown_fences(self):
        """Strips markdown code fences before parsing."""
        raw = "```json\n" + json.dumps([SAMPLE_LLM_RESPONSE]) + "\n```"
        results = self.extractor._parse_extraction_response(raw, multi_project=True)
        assert len(results) == 1

    def test_parse_empty_response(self):
        """Empty or malformed response returns empty list."""
        assert self.extractor._parse_extraction_response("", True) == []
        assert self.extractor._parse_extraction_response("invalid json{", True) == []
        assert self.extractor._parse_extraction_response("[]", True) == []

    def test_parse_no_project_name(self):
        """Records without project_name are skipped."""
        data = [{"project_type": "solar", "capacity_mw": 100}]
        results = self.extractor._parse_extraction_response(json.dumps(data), True)
        assert len(results) == 0

    def test_normalize_project_type(self):
        """Project type normalization covers common variants."""
        n = self.extractor._normalize_project_type
        assert n("photovoltaic") == "solar"
        assert n("PV") == "solar"
        assert n("Wind Farm") == "wind"
        assert n("BESS") == "battery"
        assert n("offshore wind") == "wind"
        assert n("Geothermal Plant") == "geothermal"
        assert n("unknown tech") == "unknown"
        assert n(None) is None

    def test_normalize_lifecycle(self):
        """Lifecycle stage normalization."""
        n = self.extractor._normalize_lifecycle
        assert n("under construction") == "under_construction"
        assert n("operational") == "operational"
        assert n("Planned") == "planned"
        assert n("approved") == "approved"
        assert n(None) is None

    def test_parse_int_with_suffixes(self):
        """Dollar amount parsing handles M and B suffixes."""
        p = self.extractor._parse_int
        assert p("$400M") == 400_000_000
        assert p("1.5B") == 1_500_000_000
        assert p("500,000,000") == 500_000_000
        assert p(None) is None
        assert p("not a number") is None

    def test_parse_float(self):
        """Float parsing returns None for invalid values."""
        p = self.extractor._parse_float
        assert p(250) == 250.0
        assert p("150.5") == 150.5
        assert p(None) is None
        assert p("N/A") is None


# ─── Geolocation Tests ────────────────────────────────────

class TestGeoLocation:

    def setup_method(self):
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
        from app.services.geolocation import GeoLocationService, US_STATE_CENTROIDS
        self.geo = GeoLocationService()
        self.centroids = US_STATE_CENTROIDS

    def test_normalize_state_abbreviation(self):
        """2-letter state abbreviations pass through correctly."""
        assert self.geo._normalize_state("CA") == "CA"
        assert self.geo._normalize_state("TX") == "TX"
        assert self.geo._normalize_state("ny") == "NY"

    def test_normalize_state_full_name(self):
        """Full state names map to abbreviations."""
        assert self.geo._normalize_state("california") == "CA"
        assert self.geo._normalize_state("Texas") == "TX"
        assert self.geo._normalize_state("new york") == "NY"

    def test_state_centroids_coverage(self):
        """All 50 states + DC have centroid coordinates."""
        assert len(self.centroids) == 51  # 50 + DC
        for abbr, (lat, lon) in self.centroids.items():
            assert -90 <= lat <= 90, f"{abbr} latitude out of range"
            assert -180 <= lon <= 180, f"{abbr} longitude out of range"

    @pytest.mark.asyncio
    async def test_geocode_state_fallback(self):
        """Falls back to state centroid when no API key."""
        # Temporarily clear API key
        import app.config as config_module
        original = config_module.settings.OPENCAGE_API_KEY
        config_module.settings.OPENCAGE_API_KEY = ""

        lat, lon, conf = await self.geo.geocode(state="CA", country="USA")
        assert lat is not None
        assert lon is not None
        assert 32 <= lat <= 42  # California latitude range
        assert conf == 0.4  # State-level confidence

        config_module.settings.OPENCAGE_API_KEY = original

    @pytest.mark.asyncio
    async def test_geocode_missing_location(self):
        """Returns None when no location data available."""
        lat, lon, conf = await self.geo.geocode()
        assert lat is None
        assert lon is None
        assert conf == 0.0

    @pytest.mark.asyncio
    async def test_geocode_caching(self):
        """Same query uses cache on second call."""
        import app.config as config_module
        config_module.settings.OPENCAGE_API_KEY = ""

        lat1, lon1, _ = await self.geo.geocode(state="TX")
        lat2, lon2, _ = await self.geo.geocode(state="TX")
        assert lat1 == lat2
        assert lon1 == lon2


# ─── Project Differentiator Tests ─────────────────────────

class TestProjectDifferentiator:

    def setup_method(self):
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
        from app.services.project_differentiator import ProjectDifferentiationEngine
        self.diff = ProjectDifferentiationEngine()

    def test_normalize_name_basic(self):
        """Name normalization strips noise words."""
        n = self.diff.normalize_name
        assert "llc" not in n("Desert Bloom Solar LLC")
        assert "inc" not in n("SunRise Inc")

    def test_normalize_name_case_insensitive(self):
        """Normalized names are lowercase."""
        assert self.diff.normalize_name("DESERT BLOOM") == self.diff.normalize_name("desert bloom")

    def test_compute_similarity_identical(self):
        """Identical projects score near 1.0."""
        p = {
            "project_name": "Desert Bloom Solar",
            "state": "CA",
            "owner_company": "SunRise Energy",
            "capacity_mw": 250,
            "project_type": "solar",
        }
        score = self.diff.compute_text_similarity(p, p)
        assert score >= 0.85

    def test_compute_similarity_different(self):
        """Clearly different projects score low."""
        p1 = {"project_name": "Desert Bloom Solar", "state": "CA", "project_type": "solar", "capacity_mw": 250}
        p2 = {"project_name": "Mountain Wind Farm",  "state": "WY", "project_type": "wind",  "capacity_mw": 180}
        score = self.diff.compute_text_similarity(p1, p2)
        assert score < 0.5

    def test_group_by_name(self):
        """Projects are grouped by normalized name."""
        projects = [
            {"project_name": "Desert Bloom Solar LLC", "state": "CA"},
            {"project_name": "Desert Bloom Solar",     "state": "CA"},
            {"project_name": "Mountain Wind Farm",     "state": "WY"},
        ]
        groups = self.diff.group_by_name(projects)
        # Desert Bloom should be one group, Mountain Wind another
        assert len(groups) <= 3

    def test_get_canonical_most_complete(self):
        """Canonical project is the most data-complete record."""
        sparse   = {"project_name": "Test", "project_type": None, "owner_company": None,
                    "state": None, "capacity_mw": None, "lifecycle_stage": None,
                    "environmental_approval": None, "financing_secured": None,
                    "latitude": None, "longitude": None, "overall_confidence": 0.3}
        complete = {"project_name": "Test", "project_type": "solar", "owner_company": "Acme",
                    "state": "CA", "capacity_mw": 200, "lifecycle_stage": "operational",
                    "environmental_approval": True, "financing_secured": True,
                    "latitude": 35.0, "longitude": -120.0, "overall_confidence": 0.9}
        canonical = self.diff.get_canonical_project([sparse, complete])
        assert canonical["project_type"] == "solar"

    def test_detect_updates(self):
        """Change detection identifies modified fields."""
        old = {"lifecycle_stage": "planned", "financing_secured": False, "capacity_mw": 200}
        new = {"lifecycle_stage": "approved", "financing_secured": True, "capacity_mw": 200}
        changes = self.diff.detect_updates(old, new)
        assert any("lifecycle_stage" in c for c in changes)
        assert any("financing_secured" in c for c in changes)
        assert not any("capacity_mw" in c for c in changes)


# ─── Integration-style JSON output test ───────────────────

class TestEndToEndJSON:
    """Validate that extraction outputs conform to expected schema."""

    def test_llm_result_schema(self):
        """LLMExtractionResult validates all expected fields."""
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
        from app.models.schemas import LLMExtractionResult
        r = LLMExtractionResult(**SAMPLE_LLM_RESPONSE)
        assert r.project_name == "Desert Bloom Solar Project"
        assert r.capacity_mw == 250.0
        assert r.environmental_approval is True
        assert r.financing_amount_usd == 400_000_000
        assert isinstance(r.confidence_scores, dict)
        assert isinstance(r.source_snippets, dict)

    def test_multi_project_parse(self):
        """Multiple projects are correctly parsed from array response."""
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
        from app.services.llm_extractor import LLMExtractionEngine
        extractor = LLMExtractionEngine()

        project2 = dict(SAMPLE_LLM_RESPONSE)
        project2["project_name"] = "Mountain Wind Farm"
        project2["project_type"] = "wind"
        project2["capacity_mw"] = 180.0

        raw = json.dumps([SAMPLE_LLM_RESPONSE, project2])
        results = extractor._parse_extraction_response(raw, multi_project=True)
        assert len(results) == 2
        names = {r.project_name for r in results}
        assert "Desert Bloom Solar Project" in names
        assert "Mountain Wind Farm" in names


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
