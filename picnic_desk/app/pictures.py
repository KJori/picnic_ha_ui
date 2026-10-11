"""Load product and recipe pictures from Picnic.

A picture lives at

    https://storefront-prod.<country>.picnicinternational.com/static/images/<id>/<variant>

where <variant> is a size and a file type. Which variants exist differs per
picture, and nobody has written the rules down, so this module does not bet on
one. For every picture it tries, in order:

1. the variant Picnic itself named for that picture. Search tiles carry a
   "sellingUnitImageConfiguration" such as {id, derivativeType: "padded",
   extension: "webp"} (seen in python-picnic-api2's sample responses; typed in
   MRVDH/picnic-api), and picture components can carry the same two fields;
2. the variants the open-source clients document, most successful first;
3. the same again for a second id, when a tile names two different ones.

It remembers what worked, keeps failures for the self-check to report, and
never raises: a missing picture is a normal outcome.
"""

from __future__ import annotations

import re
import threading
import time
from collections import Counter, OrderedDict, deque

IMAGE_URL = "https://storefront-prod.{cc}.picnicinternational.com/static/images/{ref}/{variant}"
IMAGE_REF = re.compile(r"^(?:[a-z][a-z0-9_-]{1,30}/)?[A-Za-z0-9_-]{8,128}$")
VARIANT = re.compile(r"^[A-Za-z0-9_-]{1,40}\.(?:webp|png|jpe?g)$")

# "padded.webp" is what the sample search tiles ask for. The .png sizes are
# listed by python-picnic-api2 (helper.py) and MRVDH/picnic-api (ImageSize);
# "tile-medium.webp" and "regular.png" by python-picnic-api2 only; "large.png"
# is what ivo-toby/mcp-picnic uses for recipe pictures.
PRODUCT_VARIANTS = ("padded.webp", "medium.png", "small.png", "large.png", "tile-medium.webp", "regular.png")
RECIPE_VARIANTS = ("large.png", "medium.png", "padded.webp", "small.png", "regular.png")

CACHE_ITEMS = 600
HINT_ITEMS = 6000
MISSING_FOR = 600  # seconds before a picture that failed is tried again
PARALLEL = 6
RETRY_STATUSES = {429, 500, 502, 503, 504}


def variant_name(derivative, extension) -> str | None:
    """'padded' + 'webp' -> 'padded.webp', or None when either part is unusable."""
    if not isinstance(derivative, str) or not isinstance(extension, str):
        return None
    name = f"{derivative}.{extension.lstrip('.')}"
    return name if VARIANT.match(name) else None


def kind_of(data: bytes) -> str | None:
    """The content type of picture bytes, or None when they are not a picture."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[4:12] in (b"ftypavif", b"ftypavis"):
        return "image/avif"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data.lstrip()[:4] == b"<svg":
        return "image/svg+xml"
    return None


class Pictures:
    def __init__(self, country: str, get_session, sleep=time.sleep):
        self.country = country.lower()
        self._get_session = get_session  # returns the signed-in session, or None
        self._sleep = sleep
        self._lock = threading.Lock()
        self._gate = threading.BoundedSemaphore(PARALLEL)
        self._cache: OrderedDict[str, bytes] = OrderedDict()
        self._variants: OrderedDict[str, list[str]] = OrderedDict()
        self._alternates: OrderedDict[str, str] = OrderedDict()
        self._missing: dict[str, float] = {}
        self.worked: Counter[str] = Counter()
        self.failures: deque[dict] = deque(maxlen=40)

    # ------------------------------------------------------------------ hints

    def hint(self, ref, variant: str | None = None, alternate: str | None = None):
        """Remember what Picnic said about a picture: its variant, and a second
        id that may hold the same picture."""
        if not isinstance(ref, str) or not IMAGE_REF.match(ref):
            return
        with self._lock:
            if variant and VARIANT.match(variant):
                known = self._variants.setdefault(ref, [])
                if variant not in known:
                    known.insert(0, variant)
                self._variants.move_to_end(ref)
                while len(self._variants) > HINT_ITEMS:
                    self._variants.popitem(last=False)
            if isinstance(alternate, str) and alternate != ref and IMAGE_REF.match(alternate):
                self._alternates[ref] = alternate
                self._alternates.move_to_end(ref)
                while len(self._alternates) > HINT_ITEMS:
                    self._alternates.popitem(last=False)

    def candidates(self, ref: str) -> list[tuple[str, str]]:
        """Every (id, variant) to try for a picture, best guess first."""
        with self._lock:
            hinted = list(self._variants.get(ref, []))
            alternate = self._alternates.get(ref)
            score = dict(self.worked)
        base = RECIPE_VARIANTS if "/" in ref else PRODUCT_VARIANTS
        # Stable sort: what has worked most in this session first, then the documented order.
        generic = sorted(base, key=lambda name: -score.get(name, 0))
        out = [(ref, name) for name in hinted + [g for g in generic if g not in hinted]]
        if alternate:
            out += [(alternate, name) for name in generic[:3]]
        return out

    # ---------------------------------------------------------------- loading

    def _fetch(self, session, ref: str, variant: str):
        url = IMAGE_URL.format(cc=self.country, ref=ref, variant=variant)
        for attempt in (1, 2):
            try:
                with self._gate:
                    response = session.get(url)
            except Exception as err:  # network trouble is a normal outcome here
                return None, type(err).__name__
            status = response.status_code
            if status == 200:
                data = response.content or b""
                if not data:
                    return None, "empty"
                return (data, 200) if kind_of(data) else (None, "not a picture")
            if status in RETRY_STATUSES and attempt == 1:
                self._sleep(0.6)
                continue
            return None, status
        return None, "no answer"

    def load(self, ref: str, fresh: bool = False):
        """Return (bytes or None, the variant that worked or None, what was tried).

        "What was tried" is a list of (id/variant, outcome) and is empty when
        the answer came from memory.
        """
        if not isinstance(ref, str) or not IMAGE_REF.match(ref):
            return None, None, []
        with self._lock:
            if ref in self._cache and not fresh:
                self._cache.move_to_end(ref)
                return self._cache[ref], None, []
            if not fresh and self._missing.get(ref, 0) > time.time():
                return None, None, []
        session = self._get_session()
        if session is None:
            return None, None, []

        tried = []
        for target, variant in self.candidates(ref):
            data, outcome = self._fetch(session, target, variant)
            label = variant if target == ref else f"{target[:10]}…/{variant}"
            tried.append((label, outcome))
            if data is None:
                continue
            with self._lock:
                self.worked[variant] += 1
                self._missing.pop(ref, None)
                self._cache[ref] = data
                self._cache.move_to_end(ref)
                while len(self._cache) > CACHE_ITEMS:
                    self._cache.popitem(last=False)
            return data, variant, tried

        with self._lock:
            self._missing[ref] = time.time() + MISSING_FOR
            if len(self._missing) > HINT_ITEMS:
                self._missing.clear()
            self.failures.append({"ref": ref, "tried": tried})
        return None, None, tried

    def get(self, ref: str) -> bytes | None:
        return self.load(ref)[0]

    def forget(self):
        with self._lock:
            self._cache.clear()
            self._missing.clear()
