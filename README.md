# milessic-themes

A tiny read-only API that serves the automation-tracker look (tokens, components and nineteen
themes: System, Light, Dark, Aurora, Pinstripe, 1-bit, Slate, Bevel,
Rainbox, Robin's egg, 2000s bubbles, super glass, CONSOLE, Write.js, Holistic developer, plus the accessibility themes
High contrast L, High contrast D, Colorblind: red-green and Colorblind: blue-yellow)
so every project can share it.

How to build an app on top of it: **[MANIFESTO.md](MANIFESTO.md)**.

## Run

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn server.main:app --port 8765
```

Open http://localhost:8765/ for the gallery (every component, live switcher; `/?theme=bevel` opens a
given theme). Tests: `pytest`.

| Env var             | Default | Meaning                                                              |
|---------------------|---------|----------------------------------------------------------------------|
| `THEMES_MAX_AGE`    | `300`   | Cache seconds for unversioned CSS/JS (versioned `?v=` is immutable). |
| `THEMES_PUBLIC_URL` | –       | Absolute origin used in `/api/themes` URLs when behind a proxy.     |

## API

| Method | Path                     | Returns                                                              |
|--------|--------------------------|----------------------------------------------------------------------|
| GET    | `/`                      | Gallery page                                                         |
| GET    | `/manifesto`             | MANIFESTO.md rendered in an overlay wearing the current theme (`?theme=` works too) |
| GET    | `/manifesto.md`          | MANIFESTO.md as raw markdown                                         |
| GET    | `/health`                | `{"status": "ok", "version": "1.0.0"}`                               |
| GET    | `/api/themes`            | Registry: version, default, `base_url`, `script_url`, themes[]       |
| GET    | `/api/themes/{key}`      | One theme: key, label, scheme (`auto`/`light`/`dark`), description, `bundle_url`, `overlay_url` |
| GET    | `/css/bundle/{key}.css`  | **base + overlay in one file — the link apps should use**            |
| GET    | `/css/base.css`          | Tokens, components, system/light/dark                                |
| GET    | `/css/themes/{key}.css`  | Overlay only (404 for system/light/dark)                             |
| GET    | `/js/themes.js`          | Optional client helper (switching, picker, persistence)              |

All responses send `Access-Control-Allow-Origin: *`; CSS/JS send an `ETag` (304 on match).
Unknown keys are 404: the registry is the allow-list, keys never touch the filesystem unchecked.

## Layout

```
themes/registry.json   theme list + version (bump version on every CSS change)
themes/base.css        tokens + component contract + system/light/dark
themes/<key>.css       overlay, every selector scoped to [data-theme="<key>"]
static/themes.js       client helper
server/main.py         the API
manifesto.html         /manifesto page template (markdown rendered server-side)
index.html             gallery
tests/                 API + contract tests
```

## Adding a theme

1. `themes/<key>.css`: redefine tokens under `:root[data-theme="<key>"]`, restyle components with
   `[data-theme="<key>"] .selector`. Nothing unscoped (a test enforces it).
2. Add an entry to `themes/registry.json` and bump `version`.
3. Add a `.tp-<key>` picker preview to `base.css` (a test enforces it).
4. Check every component in the gallery: `/?theme=<key>`.

## License

Free for anyone to use, provided the app states its styling is taken from milessic-themes with a
hyperlink to the milessic-themes server (https://THEMES-SERVER-URL). See [LICENSE](LICENSE) and
[MANIFESTO.md §10](MANIFESTO.md#10-license-and-attribution).
