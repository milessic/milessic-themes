import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.main import app

ROOT = Path(__file__).resolve().parent.parent
REGISTRY = json.loads((ROOT / "themes" / "registry.json").read_text())
OVERLAYS = [t["key"] for t in REGISTRY["themes"] if t["overlay"]]
BUILT_IN = [t["key"] for t in REGISTRY["themes"] if not t["overlay"]]

client = TestClient(app)


def test_health():
    assert client.get("/health").json() == {"status": "ok", "version": REGISTRY["version"]}


def test_gallery():
    r = client.get("/")
    assert r.status_code == 200 and "data-milessic-theme" in r.text


def test_manifesto():
    r = client.get("/manifesto")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/html")
    assert "data-milessic-theme" in r.text and "{{content}}" not in r.text
    assert "<h1" in r.text and '<table class="data">' in r.text


def test_manifesto_md():
    r = client.get("/manifesto.md")
    assert r.status_code == 200 and r.text == (ROOT / "MANIFESTO.md").read_text()


def test_list_themes():
    body = client.get("/api/themes").json()
    assert body["version"] == REGISTRY["version"]
    assert body["default"] == REGISTRY["default"]
    assert [t["key"] for t in body["themes"]] == [t["key"] for t in REGISTRY["themes"]]
    bevel = next(t for t in body["themes"] if t["key"] == "bevel")
    assert bevel["bundle_url"].endswith(f"/css/bundle/bevel.css?v={REGISTRY['version']}")
    assert bevel["overlay_url"].endswith(f"/css/themes/bevel.css?v={REGISTRY['version']}")
    assert next(t for t in body["themes"] if t["key"] == "dark")["overlay_url"] is None


def test_get_theme_and_unknown():
    assert client.get("/api/themes/aurora").json()["label"] == "Aurora"
    assert client.get("/api/themes/nope").status_code == 404


def test_base_css():
    r = client.get("/css/base.css")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/css")
    assert ':root[data-theme="dark"]' in r.text


@pytest.mark.parametrize("key", OVERLAYS)
def test_bundle_is_base_plus_overlay(key):
    base = client.get("/css/base.css").text
    overlay = client.get(f"/css/themes/{key}.css").text
    assert client.get(f"/css/bundle/{key}.css").text == base + "\n" + overlay


@pytest.mark.parametrize("key", BUILT_IN)
def test_built_in_themes_bundle_to_base_and_have_no_overlay(key):
    assert client.get(f"/css/bundle/{key}.css").text == client.get("/css/base.css").text
    assert client.get(f"/css/themes/{key}.css").status_code == 404


@pytest.mark.parametrize("path", ["/css/themes/..%2Fbase.css", "/css/bundle/..%2F..%2Fserver%2Fmain.css",
                                  "/css/themes/registry.css", "/api/themes/..%2Fregistry"])
def test_only_registered_keys_are_served(path):
    assert client.get(path).status_code == 404


def test_etag_and_cache_headers():
    r = client.get("/css/bundle/bevel.css")
    assert r.headers["cache-control"] == "public, max-age=300"
    again = client.get("/css/bundle/bevel.css", headers={"If-None-Match": r.headers["etag"]})
    assert again.status_code == 304 and again.content == b""
    versioned = client.get("/css/bundle/bevel.css?v=1.0.0")
    assert "immutable" in versioned.headers["cache-control"]


def test_cors():
    r = client.get("/css/base.css", headers={"Origin": "https://some-app.example"})
    assert r.headers["access-control-allow-origin"] == "*"


def test_script():
    r = client.get("/js/themes.js")
    assert r.status_code == 200 and "MilessicThemes" in r.text


# --- contract: overlays only style their own theme -------------------------

def selectors(css):
    """Selector lists of every style rule, descending into @media blocks."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    out, depth, buf = [], 0, ""
    for ch in css:
        if ch == "{":
            head = buf.strip()
            if not head.startswith("@"):
                out.append(head)
            depth += 1; buf = ""
        elif ch == "}":
            depth -= 1; buf = ""
        elif ch == ";":
            buf = ""
        else:
            buf += ch
    return out


def top_level_parts(selector):
    """Split a selector list on commas that are not inside :is()/:not() parentheses."""
    parts, depth, buf = [], 0, ""
    for ch in selector:
        depth += (ch == "(") - (ch == ")")
        if ch == "," and depth == 0:
            parts.append(buf); buf = ""
        else:
            buf += ch
    return parts + [buf]


@pytest.mark.parametrize("key", OVERLAYS)
def test_overlay_rules_are_scoped_to_their_theme(key):
    css = (ROOT / "themes" / f"{key}.css").read_text()
    for sel in selectors(css):
        for part in top_level_parts(sel):
            assert f'[data-theme="{key}"]' in part, f"{key}.css: unscoped selector {part.strip()!r}"


def test_every_theme_has_a_picker_preview():
    base = (ROOT / "themes" / "base.css").read_text()
    for t in REGISTRY["themes"]:
        assert f".tp-{t['key']} " in base, f"missing .tp-{t['key']} preview"
