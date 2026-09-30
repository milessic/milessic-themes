"""milessic-themes: a tiny read-only API that serves theme stylesheets.

GET /                          gallery page (every component, live theme switcher)
GET /health                    liveness probe
GET /api/themes                registry: all themes + their URLs
GET /api/themes/{key}          one theme
GET /css/base.css              tokens + components + system/light/dark
GET /css/themes/{key}.css      overlay only (404 for system/light/dark: they live in base.css)
GET /css/bundle/{key}.css      base.css + overlay in one file (the recommended link)
GET /js/themes.js              optional client helper (switching, picker, persistence)

Add ?v=<registry version> to any CSS/JS URL to get a year-long immutable cache.
"""
import hashlib
import json
import os
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

ROOT = Path(__file__).resolve().parent.parent
THEMES_DIR = ROOT / "themes"
STATIC_DIR = ROOT / "static"
# Seconds a client may cache an unversioned CSS/JS response.
MAX_AGE = int(os.environ.get("THEMES_MAX_AGE", "300"))
# Set when served behind a proxy/sub-path, e.g. https://themes.example.com
PUBLIC_URL = os.environ.get("THEMES_PUBLIC_URL", "").rstrip("/")

app = FastAPI(title="milessic-themes", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "HEAD"], allow_headers=["*"])


@lru_cache
def registry() -> dict:
    data = json.loads((THEMES_DIR / "registry.json").read_text())
    data["by_key"] = {t["key"]: t for t in data["themes"]}
    return data


@lru_cache
def read(path: Path) -> str:
    return path.read_text()


def theme_or_404(key: str) -> dict:
    # The registry is the allow-list: keys never reach the filesystem unchecked.
    theme = registry()["by_key"].get(key)
    if theme is None:
        raise HTTPException(404, f"Unknown theme '{key}'.")
    return theme


def asset(request: Request, body: str, media_type: str) -> Response:
    etag = '"' + hashlib.sha256(body.encode()).hexdigest()[:16] + '"'
    if "v" in request.query_params:
        cache = "public, max-age=31536000, immutable"
    else:
        cache = f"public, max-age={MAX_AGE}"
    headers = {"ETag": etag, "Cache-Control": cache}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return Response(body, media_type=media_type, headers=headers)


def describe(theme: dict, base: str) -> dict:
    key, version = theme["key"], registry()["version"]
    return {
        **theme,
        "bundle_url": f"{base}/css/bundle/{key}.css?v={version}",
        "overlay_url": f"{base}/css/themes/{key}.css?v={version}" if theme["overlay"] else None,
    }


def base_url(request: Request) -> str:
    return PUBLIC_URL or str(request.base_url).rstrip("/")


@app.get("/", include_in_schema=False)
def gallery():
    return FileResponse(ROOT / "index.html")


@app.get("/health")
def health():
    return {"status": "ok", "version": registry()["version"]}


@app.get("/api/themes")
def list_themes(request: Request):
    reg, base = registry(), base_url(request)
    return JSONResponse({
        "version": reg["version"],
        "default": reg["default"],
        "base_url": f"{base}/css/base.css?v={reg['version']}",
        "script_url": f"{base}/js/themes.js?v={reg['version']}",
        "themes": [describe(t, base) for t in reg["themes"]],
    })


@app.get("/api/themes/{key}")
def get_theme(key: str, request: Request):
    return describe(theme_or_404(key), base_url(request))


@app.get("/css/base.css")
def base_css(request: Request):
    return asset(request, read(THEMES_DIR / "base.css"), "text/css")


@app.get("/css/themes/{key}.css")
def overlay_css(key: str, request: Request):
    theme = theme_or_404(key)
    if not theme["overlay"]:
        raise HTTPException(404, f"Theme '{key}' is built into base.css and has no overlay.")
    return asset(request, read(THEMES_DIR / f"{key}.css"), "text/css")


@app.get("/css/bundle/{key}.css")
def bundle_css(key: str, request: Request):
    theme = theme_or_404(key)
    body = read(THEMES_DIR / "base.css")
    if theme["overlay"]:
        body += "\n" + read(THEMES_DIR / f"{key}.css")
    return asset(request, body, "text/css")


@app.get("/js/themes.js")
def themes_js(request: Request):
    return asset(request, read(STATIC_DIR / "themes.js"), "text/javascript")
