# The milessic-themes manifesto

How to build an application so that it wears every milessic theme, today's fourteen and the ones
added later, without changing a line of its own code.

---

## 1. Principles

1. **Markup describes, themes decide.** Your HTML uses the shared component classes (`.card`, `.btn`,
   `table.data`, …) and says *what* something is. How it looks is entirely the theme's job.
2. **One attribute, one stylesheet.** A page is themed by exactly two things:
   `<html data-theme="KEY">` and `<link rel="stylesheet" href="…/css/bundle/KEY.css">`. Both always
   carry the same key.
3. **Tokens, never literals.** Your own CSS uses only the public tokens (`var(--surface)`,
   `var(--accent)`, …). No hex values, no `font-family`, no `border-radius: 8px`. A literal color
   is a bug that shows up the day someone picks 1-bit.
4. **Themes are overlays.** A theme only redefines tokens and restyles components under its own
   `[data-theme]`. Your app does the same for its own widgets, and never the other way round.
5. **The server knows the theme.** Whenever you can, render the key into the HTML so the first
   paint is already correct. Client-side switching is a convenience, not the base.
6. **Color never carries meaning alone.** Tones (`tone-ok`, `tone-fail`, …) always come with a text
   label. 1-bit has no colors, and some people can't tell them apart.
7. **Degrade, don't break.** If the themes server is unreachable, the app must still work,
   plain but usable.

---

## 2. Integrating

Replace `THEMES` with the server origin, e.g. `https://themes.example.com`.
Pin the registry version with `?v=` so browsers cache the files forever and you upgrade deliberately.

### Level 1: one fixed theme (static pages, internal tools)

```html
<!doctype html>
<html lang="en" data-theme="system">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" data-milessic-theme href="THEMES/css/bundle/system.css?v=1.0.0">
  <link rel="stylesheet" href="/static/app.css">   <!-- your own CSS, always AFTER the bundle -->
</head>
```

### Level 2: user-selectable, server-rendered (recommended; FastAPI + Jinja example)

Store the key per user (a `theme TEXT NOT NULL DEFAULT 'system'` column), validate it against the
registry, render it.

```python
# themes.py
import httpx, os
THEMES_URL = os.environ.get("THEMES_URL", "http://localhost:8765")
THEMES_VERSION = "1.0.0"
_registry = None

def registry() -> dict:
    """Fetched once at startup; on failure fall back to the built-ins so the app still boots."""
    global _registry
    if _registry is None:
        try:
            _registry = httpx.get(f"{THEMES_URL}/api/themes", timeout=3).json()
        except httpx.HTTPError:
            _registry = {"default": "system", "themes": [{"key": k, "label": k.title()} for k in ("system", "light", "dark")]}
    return _registry

def theme_keys() -> set[str]:
    return {t["key"] for t in registry()["themes"]}

templates.env.globals.update(THEMES_URL=THEMES_URL, THEMES_VERSION=THEMES_VERSION)
```

```jinja
{# base.html #}
{% set theme = user.theme if user else 'system' %}
<html lang="en" data-theme="{{ theme }}">
<head>
  <link rel="stylesheet" data-milessic-theme
        href="{{ THEMES_URL }}/css/bundle/{{ theme }}.css?v={{ THEMES_VERSION }}">
  <link rel="stylesheet" href="{{ static_url('app.css') }}">
</head>
```

```python
@router.post("/settings/theme")
def set_theme(theme: str = Form(...), user=Depends(current_user)):
    if theme not in theme_keys():          # the registry is the allow-list
        raise HTTPException(400, "Invalid theme.")
    save_user_theme(user.id, theme)
    return redirect("/settings")
```

A settings form can reuse the picker markup from base.css (radio inputs, so it works without JS):

```jinja
<div class="theme-grid" role="radiogroup" aria-label="Theme">
  {% for t in registry().themes %}
  <label class="theme-option" title="{{ t.description }}">
    <input type="radio" name="theme" value="{{ t.key }}" {{ 'checked' if user.theme == t.key }}>
    <span class="theme-preview tp-{{ t.key }}" aria-hidden="true"><span class="tp-window"><span class="tp-bar"></span><span class="tp-btn"></span></span></span>
    <span class="theme-label">{{ t.label }}</span>
  </label>
  {% endfor %}
</div>
```

### Level 3: client-side (SPA, static hosting, no user accounts)

```html
<html lang="en" data-theme="system">
<head>
  <link rel="stylesheet" data-milessic-theme href="THEMES/css/bundle/system.css?v=1.0.0">
  <!-- no defer: re-applies the stored theme as early as possible. The default may flash
       for a moment while the stored sheet loads; Level 2 avoids that. -->
  <script src="THEMES/js/themes.js?v=1.0.0"></script>
</head>
<body>
  <div id="theme-picker"></div>
  <script>MilessicThemes.mountPicker(document.getElementById("theme-picker"));</script>
</body>
```

| Helper call                                    | Does                                                              |
|------------------------------------------------|-------------------------------------------------------------------|
| `MilessicThemes.apply(key)`                    | Sets `data-theme`, swaps the link (new sheet loads before the old one is dropped), stores in `localStorage` |
| `MilessicThemes.current()`                     | Active key                                                        |
| `MilessicThemes.list()`                        | `Promise` of `/api/themes`                                        |
| `MilessicThemes.mountPicker(el, {onChange, apply, name, label})` | Renders the radio picker; `apply: false` + `onChange` to save server-side instead |
| `document` event `milessic:themechange`        | Fired on every switch (`e.detail.key`), e.g. to redraw canvas charts |
| `<script data-persist="false">`                | Don't use `localStorage`                                          |
| `<script data-restore="false">`                | Don't re-apply the stored theme on load (server decides)          |

Level 2 + helper: render the user's theme on the server, load the helper with
`data-restore="false"`, and call `mountPicker(el, {onChange: key => fetch("/settings/theme", …)})`
for instant switching that is also saved.

---

## 3. Page skeleton

Themes rely on this structure. Window themes turn `.topbar` into a menu bar or taskbar, and the page
background into a desktop.

```html
<body>
  <header class="topbar">
    <a class="brand" href="/">App name</a>
    <nav class="nav">
      <a href="/" class="active">Dashboard</a>
      <a href="/items">Items</a>
    </nav>
    <div class="topbar-end"><span class="muted">user</span><button class="btn ghost small">Log out</button></div>
  </header>
  <main class="container">
    <div class="page-head"><h1>Title</h1><div class="filters">…</div></div>
    <div class="flash success" role="status">Saved.</div>
    <section class="card">…</section>
  </main>
</body>
```

* All content lives in **cards**. Text placed directly on the page sits on a desktop (teal, dither,
  blue) and is only readable inside `.page-head` and `.legend`, which the themes style for that.
* Keep the content inside `.container`: Bevel moves `.topbar` to a fixed taskbar at the
  bottom and pads `.container` so nothing hides under it.
* One `.active` link in `.nav`.

---

## 4. The component contract

These classes are the API between apps and themes. Every theme must style them; apps should build
from them before inventing new ones. The gallery (`/`) shows each one in each theme.

| Area      | Classes / markup |
|-----------|------------------|
| Layout    | `.topbar` `.brand` `.nav` (`a.active`) `.topbar-end` · `.container` · `.page-head` `.section-head` · `.card` (`.narrow` `.empty` `.danger-card`) · `.grid-2` `.split` · `.stack` `.row` · `.scroll-x` · `.auth` + `.auth-card` |
| Text      | `h1`–`h3` · `.muted` `.small` · `code` `.mono` `kbd` · `.warn-text` |
| Forms     | `label` (wraps its control) · `label.check` · `input` `select` `textarea` · `.inline-form` `.filters` `.toolbar` (+ `.grow`) · `details`/`summary` |
| Buttons   | `.btn` + `.primary` `.ghost` `.danger` `.small`, `[disabled]` · `.segmented` (label › radio + span) · `.chip` (`.on`) |
| Messages  | `.flash` + `.success` `.info` `.error` · `.tooltip` (`.static` for inline use) · `.secret` · `.danger-zone` |
| Tables    | `table.data` · `th`/`td.num` `.actions` · `tr.dim` · `.sort-btn` + `th[aria-sort]` · `table.selectable` + `tr.selected` |
| Labels    | `.tag` · `.status.on` / `.status.off` · `.dot` (`style="--dot-color:#hex"`) |
| Data      | tone classes `.tone-ok` `.tone-fail` `.tone-warn` `.tone-caution` `.tone-neutral` on `.badge` `.swatch` `.distribution .seg` `.meter-fill` · `.legend` · `.tiles` › `.tile` › `.tile-label` + `.tile-value` · `.meter` › `.meter-fill` |
| Picker    | `.theme-grid` › `label.theme-option` › radio + `.theme-preview.tp-KEY` + `.theme-label` |

Markup rules:

* Buttons are `<button class="btn">` or `<a class="btn">`. Never a styled `div`.
* Status text must be a label (`<span class="badge tone-fail">Fail</span>`), never a bare swatch.
* `.distribution` segments get `style="flex: N"` and the container an `aria-label` with the numbers.
* User-chosen colors (a client's color) go through a custom property (`--dot-color`), never
  `style="background:…"`, so 1-bit themes can override them.

### Reserved: don't touch

Window themes draw their chrome with pseudo-elements and extra padding. Apps must **not** use or
restyle:

* `.card::before`, `.card::after`, `.card` `padding-top` (title bars, close boxes, traffic lights)
* `.flash::before` (alert icons) · `.brand::before` · `.nav a::after`
* the position of `.topbar` (it may be sticky at the top or fixed at the bottom)

If a widget needs a decoration, put it on an inner element.

---

## 5. Tokens

Public tokens, redefined by every theme. Your CSS may use these and nothing else:

| Token | Use |
|-------|-----|
| `--page` | page / desktop background |
| `--surface`, `--surface-2` | cards and controls; subtle fills (hover, tiles, zebra) |
| `--ink`, `--ink-2`, `--muted` | primary, secondary and tertiary text |
| `--line`, `--line-strong` | hairlines; control borders |
| `--ring` | card border / faint outline |
| `--accent`, `--accent-ink` | links, primary action, selection; text on accent |
| `--danger`, `--success-text` | destructive; positive text |
| `--tone-ok` `--tone-fail` `--tone-warn` `--tone-caution` `--tone-neutral` | status palette (may be a **pattern**: use as `background`, never as `color`) |
| `--radius` | card radius (0 in retro themes; derive smaller radii from it) |
| `--font`, `--font-mono` | font stacks (`font: inherit` on custom controls) |

Theme-private tokens (`--raised`, `--sunken`, `--bevel-in`, `--window-shadow`, `--control-bg`,
`--tint`, `--dither`, …) are internal to one theme and may change at any time. Don't use them.

---

## 6. Your own components

The contract won't cover everything. For an app widget:

```css
/* app.css: loaded after the bundle */
.timeline { border-left: 2px solid var(--line-strong); padding-left: 1rem; }
.timeline-item { background: var(--surface-2); border-radius: calc(var(--radius) / 2); }
.timeline-item.tone-fail { box-shadow: inset 3px 0 0 var(--tone); }

/* optional per-theme polish, same scoping rule as the themes themselves */
[data-theme="bevel"] .timeline-item { border-radius: 0; box-shadow: inset 1px 1px 0 #808080, inset -1px -1px 0 #fff; }
[data-theme="onebit"]  .timeline-item { border: 1px solid #000; }
```

1. **Tokens first.** A widget written only with tokens already works in every theme, including
   future ones. Most widgets never need step 2.
2. **Theme polish is optional and scoped.** `[data-theme="KEY"] .your-class` only. Never restyle a
   contract class from app CSS, and never redefine a token under `:root`.
3. **Unknown themes must look fine.** New themes appear without your app changing, so your
   default (token-only) styles are what they get.
4. **Charts:** fill marks with `background: var(--tone-*)` (not `color`/SVG `fill` with a pattern),
   outline them with `var(--ink)` if they must stay visible on white, and redraw on
   `milessic:themechange` if you paint on canvas (read tokens with
   `getComputedStyle(document.documentElement).getPropertyValue("--accent")`).
5. **Dark mode:** `scheme: "auto"` themes (System, Aurora, Slate, Write.js) follow
   `prefers-color-scheme` by themselves. Don't add your own dark-mode media queries; tokens already
   flip.
6. If a widget is useful to several apps, propose it for the contract (add it to `base.css`, every
   overlay, and the gallery) instead of copying it between apps.

---

## 7. Operations

* **Pin the version.** `?v=1.0.0` → immutable cache. Upgrading is a one-line change you review in
  the gallery first.
* **Cache the registry** in the app process (it changes only with the version).
* **Outage fallback.** The themes server is a single dependency for every app. Either
  (a) accept an unstyled but working page, or (b) vendor the files at build time and serve them
  yourself:
  ```bash
  for k in $(curl -s THEMES/api/themes | python -c "import sys,json;print(' '.join(t['key'] for t in json.load(sys.stdin)['themes']))"); do
    curl -s "THEMES/css/bundle/$k.css?v=1.0.0" -o "static/themes/$k.css"; done
  ```
* **CSP:** allow the origin in `style-src` (and `script-src` if you use the helper); add
  `connect-src` for `mountPicker`/`list()`.
* **Theme keys are data.** Validate user input against the registry before rendering it into a URL.

---

## 8. Accessibility

* Keep native elements (`button`, `input`, `select`, `label`) so focus rings, keyboard handling and
  screen readers work in every theme.
* Don't remove outlines: every theme defines its own `:focus-visible` style.
* Tones always with text; charts carry an `aria-label` with the numbers.
* Check new screens in **1-bit** (no color) and **Dark** (contrast). If they read well in both,
  they will in the rest.

---

## 9. Checklist for a new app

- [ ] `<html data-theme>` and the bundle link use the same, server-validated key
- [ ] Own CSS loads after the bundle and uses only public tokens
- [ ] Layout uses `.topbar` / `.container` / `.page-head` / `.card`
- [ ] No styling of reserved pseudo-elements or `.topbar` position
- [ ] Buttons, forms, tables, messages use contract classes
- [ ] Status colors use `tone-*` classes plus a text label
- [ ] Version pinned with `?v=`; outage fallback decided
- [ ] Every screen checked in System (light + dark), 1-bit and Bevel

---

## Appendix: migrating automation-tracker

The contract was extracted from automation-tracker's `style.css`, with app-specific names made generic:

| automation-tracker | milessic-themes |
|--------------------|-----------------|
| `--r-pass` `--r-fail` `--r-broken` `--r-infra` `--r-skip` | `--tone-ok` `--tone-fail` `--tone-warn` `--tone-caution` `--tone-neutral` |
| `.r-pass` … `.r-infrastructure-failure` (setting `--r`) | `.tone-*` (setting `--tone`) |
| `.client-dot` + `--client-color` | `.dot` + `--dot-color` |
| `.bar-cell` / `.bar-fill` | `.meter` / `.meter-fill` |
| `.logout` | `.topbar-end` |
| `.dist-labels` | `.legend` |

What stays in the app (`app.css`, token-based, with the per-theme rules for them moved out of the
theme files): `.widget`, `.trend*`, `.client-heading`, `.pick-list`, `.history*`, `.tally*`,
`.stab-*`, `.session-banner`, `.draft-notice`, the column helpers (`.check-col`, `.order-col`, …).
