"""
Project Differentiation Engine
Detects duplicate projects, groups variants, and uses LLM to explain differences.
"""
import re
from typing import List, Dict, Tuple, Optional
from uuid import UUID
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import structlog

from app.services.llm_extractor import LLMExtractionEngine

logger = structlog.get_logger(__name__)

SIMILARITY_THRESHOLD = 0.9  # Above this → same project


class ProjectDifferentiationEngine:
    """
    Groups projects by name, computes similarity scores,
    and identifies whether duplicate records are the same project.
    """

    def __init__(self):
        self._llm = LLMExtractionEngine()

    def normalize_name(self, name: str) -> str:
        """Normalize project name for comparison."""
        if not name:
            return ""
        name = name.lower().strip()
        # Remove common suffixes
        name = re.sub(r"\b(llc|inc|corp|co\.?|lp|ltd|project|energy|solar|wind|farm|facility|plant)\b", "", name)
        # Remove punctuation and extra spaces
        name = re.sub(r"[^\w\s]", " ", name)
        name = re.sub(r"\s+", " ", name)
        return name.strip()

    def compute_text_similarity(self, a: Dict, b: Dict) -> float:
        """
        Compute feature-based similarity between two project dicts.
        Combines name similarity + location + capacity + lifecycle.
        """
        scores = []

        # Name similarity (TF-IDF cosine)
        name_a = self.normalize_name(a.get("project_name", ""))
        name_b = self.normalize_name(b.get("project_name", ""))
        if name_a and name_b:
            try:
                vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 3))
                matrix = vec.fit_transform([name_a, name_b])
                name_sim = cosine_similarity(matrix[0], matrix[1])[0][0]
                scores.append(("name", name_sim, 0.4))
            except Exception:
                pass

        # State match
        state_a = (a.get("state") or "").upper()
        state_b = (b.get("state") or "").upper()
        if state_a and state_b:
            state_sim = 1.0 if state_a == state_b else 0.0
            scores.append(("state", state_sim, 0.2))

        # Owner match
        owner_a = (a.get("owner_company") or "").lower()
        owner_b = (b.get("owner_company") or "").lower()
        if owner_a and owner_b:
            # Check if one is substring of the other
            owner_sim = 1.0 if (owner_a in owner_b or owner_b in owner_a) else 0.0
            if not owner_sim:
                # Word overlap
                words_a = set(owner_a.split())
                words_b = set(owner_b.split())
                if words_a and words_b:
                    owner_sim = len(words_a & words_b) / max(len(words_a), len(words_b))
            scores.append(("owner", owner_sim, 0.2))

        # Capacity match (within 10%)
        cap_a = a.get("capacity_mw")
        cap_b = b.get("capacity_mw")
        if cap_a and cap_b and cap_a > 0 and cap_b > 0:
            ratio = min(cap_a, cap_b) / max(cap_a, cap_b)
            cap_sim = ratio if ratio > 0.9 else ratio * 0.5
            scores.append(("capacity", cap_sim, 0.1))

        # Type match
        type_a = a.get("project_type", "")
        type_b = b.get("project_type", "")
        if type_a and type_b and type_a != "unknown" and type_b != "unknown":
            type_sim = 1.0 if type_a == type_b else 0.0
            scores.append(("type", type_sim, 0.1))

        if not scores:
            return 0.5  # Unknown

        # Weighted average
        total_weight = sum(w for _, _, w in scores)
        weighted_sum = sum(sim * w for _, sim, w in scores)
        return weighted_sum / total_weight if total_weight > 0 else 0.0

    def group_by_name(self, projects: List[Dict]) -> Dict[str, List[Dict]]:
        """
        Group projects by normalized name.
        Returns dict: normalized_name → list of project dicts.
        """
        groups: Dict[str, List[Dict]] = {}
        for project in projects:
            norm_name = self.normalize_name(project.get("project_name", ""))
            if not norm_name:
                continue
            if norm_name not in groups:
                groups[norm_name] = []
            groups[norm_name].append(project)
        return groups

    async def analyze_group(self, projects: List[Dict]) -> Dict:
        """
        Analyze a group of same-named projects.
        Returns comparison result with LLM explanation.
        """
        if len(projects) == 1:
            return {
                "variant_count": 1,
                "is_same_project": True,
                "similarity_score": 1.0,
                "explanation": "Single record — no comparison needed.",
                "variants": projects,
                "key_differences": [],
            }

        # Compute pairwise similarities
        n = len(projects)
        sim_matrix = np.zeros((n, n))
        for i in range(n):
            for j in range(i + 1, n):
                sim = self.compute_text_similarity(projects[i], projects[j])
                sim_matrix[i][j] = sim
                sim_matrix[j][i] = sim

        avg_similarity = float(sim_matrix[sim_matrix > 0].mean()) if (sim_matrix > 0).any() else 0.5

        # Use LLM for detailed comparison
        serializable = []
        for p in projects[:5]:  # Limit to 5 for LLM context
            serializable.append({
                k: str(v) if not isinstance(v, (str, int, float, bool, type(None))) else v
                for k, v in p.items()
                if k not in ["id", "document_id", "first_seen_at", "last_updated_at"]
            })

        llm_result = await self._llm.compare_project_variants(serializable)

        # Override LLM with threshold
        is_same = avg_similarity >= SIMILARITY_THRESHOLD
        if llm_result.get("is_same_project") is not None:
            # LLM takes precedence if confident
            llm_confidence = abs(llm_result.get("similarity_score", 0.5) - 0.5) * 2
            if llm_confidence > 0.6:
                is_same = llm_result["is_same_project"]

        return {
            "variant_count": n,
            "is_same_project": is_same,
            "similarity_score": avg_similarity,
            "llm_similarity_score": llm_result.get("similarity_score", avg_similarity),
            "explanation": llm_result.get("explanation", ""),
            "key_differences": llm_result.get("key_differences", []),
            "recommendation": llm_result.get("recommendation", ""),
            "variants": projects,
            "similarity_matrix": sim_matrix.tolist(),
        }

    def get_canonical_project(self, projects: List[Dict]) -> Dict:
        """
        Pick the most complete/authoritative project record from a group.
        Prefers records with more non-null fields and higher confidence.
        """
        def completeness_score(p: Dict) -> float:
            important_fields = [
                "project_name", "project_type", "owner_company", "state",
                "capacity_mw", "lifecycle_stage", "environmental_approval",
                "financing_secured", "latitude", "longitude"
            ]
            filled = sum(1 for f in important_fields if p.get(f) is not None)
            confidence = p.get("overall_confidence", 0.0) or 0.0
            return filled + confidence

        return max(projects, key=completeness_score)

    def detect_updates(self, old: Dict, new: Dict) -> List[str]:
        """
        Compare two project records and return list of changed fields.
        Used to detect when a filing updates previously known data.
        """
        changed = []
        trackable = [
            "lifecycle_stage", "environmental_approval", "grid_connection_approval",
            "financing_secured", "financing_amount_usd", "capacity_mw",
            "predicted_lifecycle_stage",
        ]
        for field in trackable:
            old_val = old.get(field)
            new_val = new.get(field)
            if old_val != new_val and new_val is not None:
                changed.append(f"{field}: {old_val} → {new_val}")
        return changed
