"""Checks for the picture loader.

Run from the repository root:  python -m unittest discover tests
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "picnic_desk" / "app"))

from pictures import IMAGE_REF, PRODUCT_VARIANTS, RECIPE_VARIANTS, Pictures, kind_of, variant_name  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32
WEBP = b"RIFF\x10\x00\x00\x00WEBP" + b"0" * 32
A, B = "a" * 64, "b" * 64
HOST = "https://storefront-prod.nl.picnicinternational.com/static/images/"


class Answer:
    def __init__(self, status, content=b""):
        self.status_code, self.content = status, content


class Session:
    """Answers by the last part of the address, e.g. {"aaaa…/padded.webp": Answer(200, WEBP)}."""

    def __init__(self, answers=None, default=None):
        self.answers, self.default, self.asked = answers or {}, default or Answer(404), []

    def get(self, url, **kwargs):
        self.asked.append(url.removeprefix(HOST))
        answer = self.answers.get(self.asked[-1], self.default)
        if isinstance(answer, list):
            answer = answer.pop(0) if len(answer) > 1 else answer[0]
        if isinstance(answer, Exception):
            raise answer
        return answer


def loader(session, country="NL"):
    return Pictures(country, lambda: session, sleep=lambda seconds: None)


class Names(unittest.TestCase):
    def test_variant_names(self):
        self.assertEqual(variant_name("padded", "webp"), "padded.webp")
        self.assertEqual(variant_name("tile-medium", ".png"), "tile-medium.png")
        for derivative, extension in ((None, "webp"), ("padded", None), ("../x", "webp"), ("padded", "exe"), ("a/b", "png"), ("", "png")):
            self.assertIsNone(variant_name(derivative, extension), (derivative, extension))

    def test_references(self):
        self.assertTrue(IMAGE_REF.match(A) and IMAGE_REF.match("recipes/" + A))
        for bad in ("../" + A, "recipes/../" + A, "a/b/" + A, "short", A + "/x.png", "http://x/" + A):
            self.assertFalse(IMAGE_REF.match(bad), bad)

    def test_kinds(self):
        self.assertEqual(kind_of(PNG), "image/png")
        self.assertEqual(kind_of(WEBP), "image/webp")
        self.assertEqual(kind_of(b"\xff\xd8\xff\xe0rest"), "image/jpeg")
        self.assertEqual(kind_of(b"\x00\x00\x00\x1cftypavif"), "image/avif")
        self.assertEqual(kind_of(b"GIF89a.."), "image/gif")
        self.assertEqual(kind_of(b" <svg xmlns"), "image/svg+xml")
        for junk in (b"", b"<html>Not found</html>", b'{"error": {}}', b"RIFF\x00\x00\x00\x00WAVE"):
            self.assertIsNone(kind_of(junk), junk)


class Order(unittest.TestCase):
    def test_documented_order_without_hints(self):
        pictures = loader(Session())
        self.assertEqual(pictures.candidates(A), [(A, name) for name in PRODUCT_VARIANTS])
        self.assertEqual(pictures.candidates("recipes/" + A), [("recipes/" + A, name) for name in RECIPE_VARIANTS])

    def test_what_picnic_names_goes_first_then_the_second_id(self):
        pictures = loader(Session())
        pictures.hint(A, "tile-small.webp", alternate=B)
        tries = pictures.candidates(A)
        self.assertEqual(tries[0], (A, "tile-small.webp"))
        self.assertEqual(tries[1:1 + len(PRODUCT_VARIANTS)], [(A, name) for name in PRODUCT_VARIANTS])
        self.assertEqual(tries[-3:], [(B, name) for name in PRODUCT_VARIANTS[:3]])
        self.assertEqual(len(tries), len(set(tries)))

    def test_bad_hints_are_ignored(self):
        pictures = loader(Session())
        pictures.hint(A, "../../etc/passwd", alternate="../x")
        pictures.hint("../x", "padded.webp")
        pictures.hint(None, "padded.webp")
        pictures.hint(A, None, alternate=A)
        self.assertEqual(pictures.candidates(A), [(A, name) for name in PRODUCT_VARIANTS])

    def test_what_worked_before_is_tried_first_next_time(self):
        session = Session({f"{A}/small.png": Answer(200, PNG), f"{B}/small.png": Answer(200, PNG)})
        pictures = loader(session)
        pictures.load(A)
        self.assertEqual(session.asked, [f"{A}/padded.webp", f"{A}/medium.png", f"{A}/small.png"])
        session.asked.clear()
        pictures.load(B)
        self.assertEqual(session.asked, [f"{B}/small.png"])


class Loading(unittest.TestCase):
    def test_first_address_that_answers_with_a_picture_wins(self):
        session = Session({f"{A}/padded.webp": Answer(200, WEBP)})
        pictures = loader(session)
        data, variant, tried = pictures.load(A)
        self.assertEqual((data, variant, tried), (WEBP, "padded.webp", [("padded.webp", 200)]))
        self.assertEqual(pictures.load(A), (WEBP, None, []), "second time from memory")
        self.assertEqual(len(session.asked), 1)
        self.assertEqual(pictures.worked["padded.webp"], 1)

    def test_country_decides_the_host(self):
        asked = []

        class Recording:
            def get(self, url, **kwargs):
                asked.append(url)
                return Answer(200, PNG)

        Pictures("DE", lambda: Recording()).get(A)
        self.assertEqual(asked, ["https://storefront-prod.de.picnicinternational.com/static/images/" + A + "/padded.webp"])

    def test_second_id_is_used_when_the_first_has_nothing(self):
        session = Session({f"{B}/medium.png": Answer(200, PNG)})
        pictures = loader(session)
        pictures.hint(A, "padded.webp", alternate=B)
        data, variant, tried = pictures.load(A)
        self.assertEqual((data, variant), (PNG, "medium.png"))
        self.assertEqual(tried[-1], ("bbbbbbbbbb…/medium.png", 200))
        self.assertEqual(pictures.get(A), PNG)

    def test_an_error_page_with_status_200_is_not_a_picture(self):
        session = Session({f"{A}/padded.webp": Answer(200, b"<html>login</html>"), f"{A}/medium.png": Answer(200, b""),
                           f"{A}/small.png": Answer(200, PNG)})
        data, variant, tried = loader(session).load(A)
        self.assertEqual((data, variant), (PNG, "small.png"))
        self.assertEqual(tried[:2], [("padded.webp", "not a picture"), ("medium.png", "empty")])

    def test_busy_server_gets_one_more_try(self):
        session = Session({f"{A}/padded.webp": [Answer(429), Answer(200, WEBP)]})
        self.assertEqual(loader(session).load(A)[:2], (WEBP, "padded.webp"))
        self.assertEqual(session.asked, [f"{A}/padded.webp"] * 2)
        still_busy = Session({f"{A}/padded.webp": Answer(503)}, default=Answer(404))
        data, _, tried = loader(still_busy).load(A)
        self.assertIsNone(data)
        self.assertEqual(tried[0], ("padded.webp", 503))
        self.assertEqual(still_busy.asked[:2], [f"{A}/padded.webp"] * 2)

    def test_a_picture_that_fails_is_reported_and_left_alone_for_a_while(self):
        session = Session(default=Answer(404))
        pictures = loader(session)
        data, variant, tried = pictures.load(A)
        self.assertEqual((data, variant), (None, None))
        self.assertEqual(tried, [(name, 404) for name in PRODUCT_VARIANTS])
        self.assertEqual(pictures.failures[-1], {"ref": A, "tried": tried})
        asked = len(session.asked)
        self.assertEqual(pictures.load(A), (None, None, []))
        self.assertEqual(len(session.asked), asked, "not asked again straight away")
        self.assertEqual(len(pictures.load(A, fresh=True)[2]), len(PRODUCT_VARIANTS), "unless asked to")

    def test_network_trouble_is_an_outcome_not_a_crash(self):
        session = Session(default=TimeoutError("slow"))
        data, _, tried = loader(session).load(A)
        self.assertIsNone(data)
        self.assertEqual(tried[0], ("padded.webp", "TimeoutError"))

    def test_nothing_without_a_session_or_with_a_bad_reference(self):
        self.assertEqual(Pictures("NL", lambda: None).load(A), (None, None, []))
        session = Session(default=Answer(200, PNG))
        self.assertEqual(loader(session).load("../../etc/passwd"), (None, None, []))
        self.assertEqual(loader(session).load(None), (None, None, []))
        self.assertEqual(session.asked, [])

    def test_forget_clears_what_was_loaded(self):
        session = Session(default=Answer(200, PNG))
        pictures = loader(session)
        pictures.get(A)
        pictures.forget()
        pictures.get(A)
        self.assertEqual(len(session.asked), 2)


if __name__ == "__main__":
    unittest.main()
