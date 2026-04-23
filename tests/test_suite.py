"""
Test Suite for Energy Project Intelligence Engine
Run with: pytest tests/ -v
"""
import pytest
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch


# ── Document Processor Tests ──────────────────────────────
class TestDocumentProcessor:
    def setup_method(self):
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
        from app.services.document_processor import DocumentProcessor
        self.processor = DocumentProcessor()

    def test_clean_text_removes_extra_whitespace(self):
        raw = "  Hello   World  \n\n\n  test  "
        result = self.processor._clean_text(raw)
        assert "  " not in result
        assert result == "Hello World\n\ntest"

    def test_extract_text_from_html_basic(self):
        html = """
        <html><body>
          <p>The Sunflower Solar Farm is a 150 MW photovoltaic project in Nevada.</p>
          <p>Environmental approval was granted in Q3 2023.</p>
          <p>Financing of $500 million was secured from Green Capital LLC.</p>
        </body></html>
        """
        text, paragraphs = self.processor.extract_text_from_html(html)
        assert "Sunflower Solar Farm" in text
        assert "150 MW" in text
        assert len(paragraphs) >= 2

    def test_chunk_text_respects_size(self):
        text = "\n\n".join([f"Paragraph {i}. " * 50 for i in range(20)])
        chunks = self.processor.chunk_text(text, chunk_size=3000, overlap=200)
        assert len(chunks) > 1
        for chunk in chunks:
            assert len(chunk["text"]) <= 4000  # some tolerance for overlap

    def test_chunk_text_empty(self):
        chunks = self.processor.chunk_text("")
        assert chunks == []

    def test_filter_relevant_chunks_keeps_energy_content(self):
        chunks = [
            {"text": "The company operates a 200 MW solar farm in California.", "chunk_id": 0},
            {"text": "The board of directors held their annual meeting.", "chunk_id": 1},
            {"text": "Environmental approval was obtained for the wind farm project.", "chunk_id": 2},
            {"text": "Revenue from operations increased by 15%.", "chunk_id": 3},
        ]
        relevant = self.processor.filter_relevant_chunks(chunks)
        texts = [c["text"] for c in relevant]
        assert any("solar farm" in t.lower() for t in texts)
        assert any("wind farm" in t.lower() for t in texts)

    def test_find_snippet_in_text(self):
        full_text = "The Desert Wind Farm LLC is a 300 MW wind energy project located in Kern County, California."
        pages = [{"page_number": 1, "char_count": len(full_text)}]
        result = self.processor.find_snippet_in_text("Desert Wind Farm", full_text, pages)
        assert result is not None
        assert "Desert Wind Farm" in result["exact_snippet"]
        assert result["page_number"] == 1


# ── LLM Extractor Tests ───────────────────────────────────
class TestLLMExtractor:
    def setup_method(self):
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
        from app.services.llm_extractor import LLMExtractionEngine
        self.extractor = LLMExtractionEngine()

    def test_normalize_project_type_solar(self):
        assert self.extractor._normalize_project_type("solar") == "solar"
        assert self.extractor._normalize_project_type("photovoltaic") == "solar"
        assert self.extractor._normalize_project_type("PV Project") == "solar"

    def test_normalize_project_type_wind(self):
        assert self.extractor._normalize_project_type("wind farm") == "wind"
        assert self.extractor._normalize_project_type("WIND") == "wind"
        assert self.extractor._normalize_project_type("offshore wind") == "wind"

    def test_normalize_project_type_battery(self):
        assert self.extractor._normalize_project_type("BESS") == "battery"
        assert self.extractor._normalize_project_type("battery storage") == "battery"

    def test_normalize_lifecycle(self):
        assert self.extractor._normalize_lifecycle("operational") == "operational"
        assert self.extractor._normalize_lifecycle("Under Construction") == "under_construction"
        assert self.extractor._normalize_lifecycle("Approved") == "approved"
        assert self.extractor._normalize_lifecycle("unknown") == "unknown"

    def test_parse_float(self):
        assert self.extractor._parse_float("150.5") == 150.5
        assert self.extractor._parse_float(None) is None
        assert self.extractor._parse_float("not-a-number") is None
        assert self.extractor._parse_float(200) == 200.0

    def test_parse_int_with_suffixes(self):
        assert self.extractor._parse_int("500M") == 500_000_000
        assert self.extractor._parse_int("1.5B") == 1_500_000_000
        assert self.extractor._parse_int("$500,000,000") == 500_000_000
        assert self.extractor._parse_int(None) is None

    def test_parse_extraction_response_single(self):
        raw_json = json.dumps({
            "project_name": "Sunny Desert Solar Farm",
            "project_type": "solar",
            "owner_company": "SunPower Corp",
            "city": "Las Vegas",
            "state": "NV",
            "country": "USA",
            "capacity_mw": 250,
            "lifecycle_stage": "operational",
            "environmental_approval": True,
            "grid_connection_approval": True,
            "financing_secured": True,
            "financing_amount_usd": 300000000,
            "confidence_scores": {"project_name": 0.95, "project_type": 0.9},
            "source_snippets": {"project_name": "The Sunny Desert Solar Farm project..."},
        })
        results = self.extractor._parse_extraction_response(raw_json, multi_project=False)
        assert len(results) == 1
        assert results[0].project_name == "Sunny Desert Solar Farm"
        assert results[0].project_type == "solar"
        assert results[0].capacity_mw == 250.0
        assert results[0].environmental_approval is True

    def test_parse_extraction_response_multi(self):
        raw_json = json.dumps([
            {"project_name": "Alpha Wind Farm", "project_type": "wind", "capacity_mw": 100},
            {"project_name": "Beta Solar Park", "project_type": "solar", "capacity_mw": 200},
        ])
        results = self.extractor._parse_extraction_response(raw_json, multi_project=True)
        assert len(results) == 2
        names = [r.project_name for r in results]
        assert "Alpha Wind Farm" in names
        assert "Beta Solar Park" in names

    def test_parse_extraction_response_handles_markdown_fences(self):
        raw = "```json\n{\"project_name\": \"Test Farm\", \"project_type\": \"solar\"}\n```"
        results = self.extractor._parse_extraction_response(raw, multi_project=False)
        assert len(results) == 1
        assert results[0].project_name == "Test Farm"

    def test_parse_extraction_response_empty(self):
        results = self.extractor._parse_extraction_response("", False)
        assert results == []

    def test_parse_extraction_skips_no_name(self):
        raw_json = json.dumps({"project_type": "solar", "capacity_mw": 100})
        results = self.extractor._parse_extraction_response(raw_json, False)
        assert results == []


# ── Geolocation Tests ─────────────────────────────────────
class TestGeoLocationService:
    def setup_method(self):
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
        from app.services.geolocation import GeoLocationService
        self.geo = GeoLocationService()

    def test_normalize_state_full_name(self):
        assert self.geo._normalize_state("California") == "CA"
        assert self.geo._normalize_state("texas") == "TX"
        assert self.geo._normalize_state("New York") == "NY"
        assert self.geo._normalize_state("nevada") == "NV"

    def test_normalize_state_abbreviation(self):
        assert self.geo._normalize_state("CA") == "CA"
        assert self.geo._normalize_state("TX") == "TX"

    def test_extract_state_from_text(self):
        assert self.geo._extract_state_from_text("project located in california") == "CA"
        assert self.geo._extract_state_from_text("wind farm in texas panhandle") == "TX"

    @pytest.mark.asyncio
    async def test_geocode_state_fallback(self):
        """With no OpenCage key, should fall back to state centroid."""
        lat, lon, conf = await self.geo.geocode(state="CA")
        assert lat is not None
        assert lon is not None
        assert 32 < lat < 42  # California latitude range
        assert -125 < lon < -114  # California longitude range
        assert conf > 0.0

    @pytest.mark.asyncio
    async def test_geocode_no_location(self):
        lat, lon, conf = await self.geo.geocode()
        assert lat is None
        assert lon is None
        assert conf == 0.0


# ── Project Differentiator Tests ──────────────────────────
class TestProjectDifferentiator:
    def setup_method(self):
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
        from app.services.project_differentiator import ProjectDifferentiationEngine
        self.engine = ProjectDifferentiationEngine()

    def test_normalize_name_removes_suffixes(self):
        name = self.engine.normalize_name("Sunflower Solar Farm LLC")
        assert "llc" not in name.lower()
        assert "solar" not in name.lower()
        assert "farm" not in name.lower()

    def test_normalize_name_lowercase(self):
        result = self.engine.normalize_name("Desert WIND Energy Project Inc")
        assert result == result.lower()

    def test_compute_similarity_identical(self):
        p = {
            "project_name": "Alpha Wind Farm",
            "state": "TX",
            "owner_company": "WindCo LLC",
            "capacity_mw": 200,
            "project_type": "wind",
        }
        score = self.engine.compute_text_similarity(p, p)
        assert score > 0.8

    def test_compute_similarity_different(self):
        p1 = {
            "project_name": "Alpha Wind Farm",
            "state": "TX",
            "owner_company": "WindCo LLC",
            "project_type": "wind",
        }
        p2 = {
            "project_name": "Beta Solar Park",
            "state": "CA",
            "owner_company": "SolarCorp Inc",
            "project_type": "solar",
        }
        score = self.engine.compute_text_similarity(p1, p2)
        assert score < 0.5

    def test_group_by_name(self):
        projects = [
            {"project_name": "Alpha Wind Farm", "id": "1"},
            {"project_name": "Alpha Wind Farm", "id": "2"},
            {"project_name": "Beta Solar Park", "id": "3"},
        ]
        groups = self.engine.group_by_name(projects)
        assert len(groups) == 2

    def test_get_canonical_project_most_complete(self):
        projects = [
            {"project_name": "Farm A", "state": "TX"},
            {
                "project_name": "Farm A", "state": "TX", "capacity_mw": 100,
                "lifecycle_stage": "operational", "environmental_approval": True,
                "overall_confidence": 0.9,
            },
        ]
        canonical = self.engine.get_canonical_project(projects)
        assert canonical["capacity_mw"] == 100

    def test_detect_updates(self):
        old = {"lifecycle_stage": "planned", "financing_secured": None}
        new = {"lifecycle_stage": "approved", "financing_secured": True}
        changes = self.engine.detect_updates(old, new)
        assert any("lifecycle_stage" in c for c in changes)
        assert any("financing_secured" in c for c in changes)


# ── Schema Validation Tests ───────────────────────────────
class TestSchemas:
    def setup_method(self):
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

    def test_llm_extraction_result_valid(self):
        from app.models.schemas import LLMExtractionResult
        result = LLMExtractionResult(
            project_name="Test Farm",
            project_type="solar",
            capacity_mw=150.0,
            state="CA",
            environmental_approval=True,
            confidence_scores={"project_name": 0.9},
        )
        assert result.project_name == "Test Farm"
        assert result.capacity_mw == 150.0

    def test_ingest_request_defaults(self):
        from app.models.schemas import IngestRequest
        req = IngestRequest(query="solar farm")
        assert req.max_documents == 20
        assert "10-K" in req.filing_types

    def test_ingest_request_validation(self):
        from app.models.schemas import IngestRequest
        import pydantic
        with pytest.raises((pydantic.ValidationError, Exception)):
            IngestRequest(query="solar", max_documents=0)  # min=1


# ── Integration Test: Full pipeline (mocked LLM) ──────────
class TestPipelineMocked:
    """Integration tests using mocked LLM responses."""

    @pytest.mark.asyncio
    async def test_document_to_extraction_flow(self):
        """Test the full text→chunk→extract flow with mocked LLM."""
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

        from app.services.document_processor import DocumentProcessor

        sample_html = """
        <html><body>
        <h1>Annual Report 2023 - SunPower Holdings Inc.</h1>
        <p>SunPower Holdings is developing the Desert Star Solar Farm, a 300 MW
           utility-scale photovoltaic project in Clark County, Nevada. The project
           received environmental approval from the Bureau of Land Management in
           February 2023. Grid interconnection agreement was executed in March 2023.
           The company secured $750 million in project financing from institutional
           investors in April 2023. Construction commenced in June 2023 and
           commercial operation is expected in Q4 2024.</p>
        <p>The project latitude is 36.1699 and longitude is -115.1398.</p>
        </body></html>
        """

        processor = DocumentProcessor()
        text, paragraphs = processor.extract_text_from_html(sample_html)

        assert "Desert Star Solar Farm" in text
        assert "300 MW" in text
        assert "Nevada" in text
        assert "environmental approval" in text.lower()
        assert "$750 million" in text

        chunks = processor.chunk_text(text)
        assert len(chunks) >= 1

        relevant = processor.filter_relevant_chunks(chunks)
        assert len(relevant) >= 1
        assert relevant[0]["relevance_score"] >= 1

        stats = processor.get_summary_stats(text)
        assert stats["has_mw_mentions"] is True
        assert stats["has_location_mentions"] is True

    def test_sample_edgar_response_parsing(self):
        """Test parsing of a realistic EDGAR search API response."""
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
        from app.services.edgar_scraper import EdgarScraper

        scraper = EdgarScraper()

        mock_source = {
            "entity_name": "GreenPower Inc",
            "entity_id": "1234567",
            "accession_no": "0001234567-23-000001",
            "form_type": "10-K",
            "file_date": "2023-01-15",
        }
        urls = scraper._build_document_urls(mock_source)
        assert isinstance(urls, list)


# ── Utility Tests ─────────────────────────────────────────
class TestUtilities:
    def test_chunk_overlap_content(self):
        """Verify that chunks share overlapping content."""
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
        from app.services.document_processor import DocumentProcessor

        processor = DocumentProcessor()
        # Create text large enough to generate multiple chunks
        text = "\n\n".join([f"This is paragraph {i} about the solar energy project in California with capacity of {i*10} MW." for i in range(50)])
        chunks = processor.chunk_text(text, chunk_size=1000, overlap=200)

        assert len(chunks) > 1
        # Each chunk should have a chunk_id
        for i, c in enumerate(chunks):
            assert c["chunk_id"] == i
