"""
Geolocation Service
Converts location strings to lat/long coordinates.
Uses OpenCage API with graceful fallback to static state centroids.
"""
import asyncio
import httpx
from typing import Optional, Tuple, Dict
import structlog
from app.config import settings

logger = structlog.get_logger(__name__)

# State centroid fallbacks (approximate centers)
US_STATE_CENTROIDS: Dict[str, Tuple[float, float]] = {
    "AL": (32.806671, -86.791130), "AK": (61.370716, -152.404419),
    "AZ": (33.729759, -111.431221), "AR": (34.969704, -92.373123),
    "CA": (36.116203, -119.681564), "CO": (39.059811, -105.311104),
    "CT": (41.597782, -72.755371), "DE": (39.318523, -75.507141),
    "FL": (27.766279, -81.686783), "GA": (33.040619, -83.643074),
    "HI": (21.094318, -157.498337), "ID": (44.240459, -114.478828),
    "IL": (40.349457, -88.986137), "IN": (39.849426, -86.258278),
    "IA": (42.011539, -93.210526), "KS": (38.526600, -96.726486),
    "KY": (37.668140, -84.670067), "LA": (31.169960, -91.867805),
    "ME": (44.693947, -69.381927), "MD": (39.063946, -76.802101),
    "MA": (42.230171, -71.530106), "MI": (43.326618, -84.536095),
    "MN": (45.694454, -93.900192), "MS": (32.741646, -89.678696),
    "MO": (38.456085, -92.288368), "MT": (46.921925, -110.454353),
    "NE": (41.125370, -98.268082), "NV": (38.313515, -117.055374),
    "NH": (43.452492, -71.563896), "NJ": (40.298904, -74.521011),
    "NM": (34.840515, -106.248482), "NY": (42.165726, -74.948051),
    "NC": (35.630066, -79.806419), "ND": (47.528912, -99.784012),
    "OH": (40.388783, -82.764915), "OK": (35.565342, -96.928917),
    "OR": (44.572021, -122.070938), "PA": (40.590752, -77.209755),
    "RI": (41.680893, -71.511780), "SC": (33.856892, -80.945007),
    "SD": (44.299782, -99.438828), "TN": (35.747845, -86.692345),
    "TX": (31.054487, -97.563461), "UT": (40.150032, -111.862434),
    "VT": (44.045876, -72.710686), "VA": (37.769337, -78.169968),
    "WA": (47.400902, -121.490494), "WV": (38.491226, -80.954453),
    "WI": (44.268543, -89.616508), "WY": (42.755966, -107.302490),
    "DC": (38.897438, -77.026817),
}

US_STATE_NAMES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
    "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
    "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
    "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
    "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
    "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
    "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
    "wisconsin": "WI", "wyoming": "WY",
}


class GeoLocationService:
    """
    Geocodes location strings to lat/long.
    Priority: explicit coords → OpenCage API → state centroid fallback.
    """

    def __init__(self):
        self._cache: Dict[str, Tuple[float, float, float]] = {}  # key → (lat, lon, confidence)

    async def geocode(
        self,
        city: Optional[str] = None,
        state: Optional[str] = None,
        country: str = "USA",
        project_name: Optional[str] = None,
    ) -> Tuple[Optional[float], Optional[float], float]:
        """
        Returns (latitude, longitude, confidence).
        confidence: 1.0 = precise, 0.7 = city-level, 0.4 = state-level, 0.0 = failed.
        """
        # Normalize state
        if state:
            state_abbr = self._normalize_state(state)
        else:
            state_abbr = None
            # Try extracting state from project name
            if project_name:
                state_abbr = self._extract_state_from_text(project_name)

        if not city and not state_abbr:
            return None, None, 0.0

        # Build cache key
        cache_key = f"{city}|{state_abbr}|{country}"
        if cache_key in self._cache:
            lat, lon, conf = self._cache[cache_key]
            return lat, lon, conf

        # Try OpenCage first
        if settings.OPENCAGE_API_KEY and (city or state_abbr):
            result = await self._opencage_geocode(city, state_abbr, country)
            if result:
                lat, lon, conf = result
                self._cache[cache_key] = (lat, lon, conf)
                return lat, lon, conf

        # Fallback to state centroid
        if state_abbr and state_abbr.upper() in US_STATE_CENTROIDS:
            lat, lon = US_STATE_CENTROIDS[state_abbr.upper()]
            conf = 0.4  # Low confidence - just state-level
            self._cache[cache_key] = (lat, lon, conf)
            logger.info("geo_state_fallback", state=state_abbr)
            return lat, lon, conf

        return None, None, 0.0

    async def _opencage_geocode(
        self,
        city: Optional[str],
        state: Optional[str],
        country: str,
    ) -> Optional[Tuple[float, float, float]]:
        """Call OpenCage Geocoding API."""
        parts = [p for p in [city, state, country] if p]
        query = ", ".join(parts)

        url = "https://api.opencagedata.com/geocode/v1/json"
        params = {
            "q": query,
            "key": settings.OPENCAGE_API_KEY,
            "limit": 1,
            "countrycode": "us" if country in ["USA", "US", "United States"] else "",
            "no_annotations": 1,
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()

                results = data.get("results", [])
                if not results:
                    return None

                best = results[0]
                geometry = best.get("geometry", {})
                confidence = best.get("confidence", 5) / 10.0  # 0-10 → 0.0-1.0

                lat = geometry.get("lat")
                lon = geometry.get("lng")

                if lat is not None and lon is not None:
                    return float(lat), float(lon), float(confidence)
        except Exception as e:
            logger.warning("opencage_error", error=str(e))

        return None

    def _normalize_state(self, state: str) -> Optional[str]:
        """Normalize state to 2-letter abbreviation."""
        if not state:
            return None
        state = state.strip()
        if len(state) == 2 and state.upper() in US_STATE_CENTROIDS:
            return state.upper()
        lookup = state.lower()
        if lookup in US_STATE_NAMES:
            return US_STATE_NAMES[lookup]
        return state.upper()[:2]

    def _extract_state_from_text(self, text: str) -> Optional[str]:
        """Try to extract a US state from free text."""
        text_lower = text.lower()
        for name, abbr in US_STATE_NAMES.items():
            if name in text_lower:
                return abbr
        # Check abbreviations
        import re
        match = re.search(r"\b([A-Z]{2})\b", text)
        if match and match.group(1) in US_STATE_CENTROIDS:
            return match.group(1)
        return None

    def get_state_from_abbr(self, abbr: str) -> Optional[str]:
        """Reverse lookup: abbr → full name."""
        if not abbr:
            return None
        reverse = {v: k.title() for k, v in US_STATE_NAMES.items()}
        return reverse.get(abbr.upper())
