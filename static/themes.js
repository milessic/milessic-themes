/* milessic-themes client helper (optional).
 *
 *   <link rel="stylesheet" data-milessic-theme href="https://THEMES/css/bundle/system.css">
 *   <script src="https://THEMES/js/themes.js"></script>
 *
 *   MilessicThemes.apply("bevel")          switch theme (sets <html data-theme>, swaps the link)
 *   MilessicThemes.current()               active key
 *   MilessicThemes.list()                  Promise<registry>  (GET /api/themes)
 *   MilessicThemes.mountPicker(el, opts)   render the theme picker into el (dropdown or gallery, see ?ts)
 *   MilessicThemes.enabled(key)            false if the script tag disabled that theme
 *   MilessicThemes.recent()                keys in "last selected" order, newest first (?so=1 only)
 *   MilessicThemes.forgetRecent()          erase that list from this browser
 *
 * Script query: ?ts=0 (default) the picker is a dropdown with lookup, ?ts=1 the preview gallery;
 * ?so=1 remembers the order of the user's choices (localStorage "milessic-theme-recent", theme keys
 * only, never sent anywhere) and lists the most recently selected themes first. Off by default.
 *
 * Script attributes: data-persist="false" disables localStorage,
 * data-restore="false" skips re-applying the stored theme on load,
 * data-themes="system,dark,bevel" offers only those themes,
 * data-exclude="console,glass" hides those themes (wins over data-themes).
 * Disabled themes are left out of list() and the picker, and apply() ignores them.
 * Every switch dispatches a "milessic:themechange" event on document ({detail: {key}}).
 */
(function () {
  "use strict";
  var script = document.currentScript;
  var ORIGIN = script ? new URL(script.src).origin : "";
  var QUERY = script ? new URL(script.src).searchParams : new URLSearchParams();
  var VERSION = QUERY.get("v");
  var PICKER = QUERY.get("ts") === "1" ? "gallery" : "dropdown";
  var STORAGE_KEY = "milessic-theme";
  var RECENT_KEY = "milessic-theme-recent";
  var persist = !script || script.dataset.persist !== "false";
  var saveOrder = persist && QUERY.get("so") === "1";
  var registryPromise = null;

  function keys(attr) {
    var raw = script && script.getAttribute(attr);
    if (!raw) return null;
    return raw.split(/[\s,]+/).filter(Boolean);
  }
  var only = keys("data-themes"), except = keys("data-exclude") || [];

  function enabled(key) {
    return (!only || only.indexOf(key) !== -1) && except.indexOf(key) === -1;
  }

  function store(key) {
    if (!persist) return;
    try { localStorage.setItem(STORAGE_KEY, key); } catch (e) { /* private mode */ }
  }
  function stored() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  // Recently selected themes (?so=1). Only keys, newest first, capped at 50: no timestamps, no ids.
  function recent() {
    if (!saveOrder) return [];
    try {
      var list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      return Array.isArray(list) ? list.filter(function (k) { return typeof k === "string"; }) : [];
    } catch (e) { return []; }
  }
  function remember(key) {
    if (!saveOrder) return;
    var list = recent().filter(function (k) { return k !== key; });
    list.unshift(key);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 50))); } catch (e) { /* private mode */ }
  }
  function forgetRecent() {
    try { localStorage.removeItem(RECENT_KEY); } catch (e) { /* private mode */ }
  }
  // Registry order, with the recently selected themes moved to the front (newest first).
  function ordered(themes) {
    var rank = recent();
    return themes.slice().sort(function (a, b) {
      var ra = rank.indexOf(a.key), rb = rank.indexOf(b.key);
      return (ra === -1 ? Infinity : ra) - (rb === -1 ? Infinity : rb) || themes.indexOf(a) - themes.indexOf(b);
    });
  }

  function link() {
    // The newest managed link: during a switch the old and new sheets briefly coexist.
    var all = document.querySelectorAll("link[data-milessic-theme]");
    var el = all[all.length - 1];
    if (!el) {
      el = document.createElement("link");
      el.rel = "stylesheet";
      el.setAttribute("data-milessic-theme", "");
      document.head.appendChild(el);
    }
    return el;
  }
  function bundleUrl(key) {
    return ORIGIN + "/css/bundle/" + encodeURIComponent(key) + ".css" + (VERSION ? "?v=" + VERSION : "");
  }

  function current() {
    return document.documentElement.getAttribute("data-theme") || "system";
  }

  function apply(key) {
    if (!enabled(key)) {
      console.warn("milessic-themes: theme '" + key + "' is disabled on this page");
      return;
    }
    var el = link(), next = bundleUrl(key);
    if (el.href !== next) {
      // Load the new sheet before dropping the old one so the page never renders unstyled.
      var fresh = el.cloneNode();
      fresh.href = next;
      fresh.onload = function () {
        // Drop only older sheets; a newer switch may already be loading after this one.
        document.querySelectorAll("link[data-milessic-theme]").forEach(function (old) {
          if (old.compareDocumentPosition(fresh) & Node.DOCUMENT_POSITION_FOLLOWING) old.remove();
        });
      };
      fresh.onerror = function () { fresh.remove(); };  // keep the working sheet
      el.after(fresh);
    }
    document.documentElement.setAttribute("data-theme", key);
    store(key);
    remember(key);
    document.dispatchEvent(new CustomEvent("milessic:themechange", { detail: { key: key } }));
  }

  function list() {
    if (!registryPromise) {
      registryPromise = fetch(ORIGIN + "/api/themes").then(function (r) {
        if (!r.ok) throw new Error("milessic-themes: registry HTTP " + r.status);
        return r.json();
      }).then(function (reg) {
        reg.themes = reg.themes.filter(function (t) { return enabled(t.key); });
        return reg;
      });
    }
    return registryPromise;
  }

  var PREVIEW = '<span class="theme-preview" aria-hidden="true"><span class="tp-window"><span class="tp-bar"></span><span class="tp-btn"></span></span></span>';
  var pickerCount = 0;

  function choose(t, opts) {
    if (opts.apply !== false) apply(t.key);
    else remember(t.key);
    if (opts.onChange) opts.onChange(t.key, t);
  }

  function mountPicker(el, opts) {
    opts = opts || {};
    return list().then(function (reg) {
      (PICKER === "gallery" ? mountGallery : mountDropdown)(el, opts, reg);
    });
  }

  function mountGallery(el, opts, reg) {
    var name = opts.name || "theme";
    el.classList.add("theme-grid");
    el.setAttribute("role", "radiogroup");
    el.setAttribute("aria-label", opts.label || "Theme");
    el.innerHTML = "";
    ordered(reg.themes).forEach(function (t) {
      var option = document.createElement("label");
      option.className = "theme-option";
      option.title = t.description;
      option.innerHTML = '<input type="radio">' + PREVIEW + '<span class="theme-label"></span>';
      var input = option.querySelector("input");
      input.name = name;
      input.value = t.key;
      input.checked = t.key === current();
      option.querySelector(".theme-preview").classList.add("tp-" + t.key);
      option.querySelector(".theme-label").textContent = t.label;
      input.addEventListener("change", function () { choose(t, opts); });
      el.appendChild(option);
    });
  }

  // A combobox: the input shows the active theme's preview on its left and filters as you type;
  // the options are buttons in a .menu, so every theme styles them (hover, focus, cursors).
  function mountDropdown(el, opts, reg) {
    var id = "milessic-theme-list-" + (++pickerCount);
    var selected = current();
    el.classList.add("theme-dropdown");
    el.innerHTML = '<span class="theme-swatch">' + PREVIEW + '</span><input type="text" role="combobox" autocomplete="off" spellcheck="false" aria-autocomplete="list" aria-expanded="false"><button type="button" class="theme-dropdown-toggle" tabindex="-1" aria-label="Show themes"><span aria-hidden="true"></span></button><div class="menu" role="listbox" hidden></div>';
    var input = el.querySelector("input"), menu = el.querySelector(".menu"), swatch = el.querySelector(".theme-preview");
    var toggle = el.querySelector(".theme-dropdown-toggle");
    input.setAttribute("aria-label", opts.label || "Theme");
    input.setAttribute("aria-controls", id);
    input.placeholder = "Search themes…";
    menu.id = id;

    function byKey(key) { return reg.themes.filter(function (t) { return t.key === key; })[0]; }
    function showSelected() {
      var t = byKey(selected);
      swatch.className = "theme-preview" + (t ? " tp-" + t.key : "");
      input.value = t ? t.label : selected;
    }
    function options() { return Array.prototype.slice.call(menu.querySelectorAll("button:not([hidden])")); }
    function render(query) {
      var q = (query || "").trim().toLowerCase(), recents = recent(), seenRecent = false, any = false;
      menu.innerHTML = "";
      ordered(reg.themes).forEach(function (t) {
        if (q && (t.label + " " + t.key + " " + (t.description || "")).toLowerCase().indexOf(q) === -1) return;
        var isRecent = recents.indexOf(t.key) !== -1;
        if (seenRecent && !isRecent && !q) menu.appendChild(document.createElement("hr"));
        seenRecent = isRecent;
        var b = document.createElement("button");
        b.type = "button";
        b.tabIndex = -1;
        b.setAttribute("role", "option");
        b.setAttribute("aria-selected", String(t.key === selected));
        b.title = t.description;
        b.innerHTML = '<span class="theme-swatch">' + PREVIEW + '</span><span class="theme-label"></span>';
        b.querySelector(".theme-preview").classList.add("tp-" + t.key);
        b.querySelector(".theme-label").textContent = t.label;
        b.addEventListener("click", function () { pick(t); });
        menu.appendChild(b);
        any = true;
      });
      if (!any) {
        var none = document.createElement("p");
        none.className = "muted small";
        none.textContent = "No theme matches.";
        menu.appendChild(none);
      }
      if (recents.length && !q) {
        menu.appendChild(document.createElement("hr"));
        var clear = document.createElement("button");
        clear.type = "button";
        clear.tabIndex = -1;
        clear.className = "theme-dropdown-forget";
        clear.textContent = "Forget recently used";
        clear.title = "Erase the list of recently selected themes from this browser";
        clear.addEventListener("click", function () { forgetRecent(); render(""); input.focus(); });
        menu.appendChild(clear);
      }
    }
    function open() {
      if (!menu.hidden) return;
      render("");
      menu.hidden = false;
      input.setAttribute("aria-expanded", "true");
      input.select();
    }
    function close(restore) {
      menu.hidden = true;
      input.setAttribute("aria-expanded", "false");
      if (restore) showSelected();
    }
    function pick(t) {
      selected = t.key;
      close(true);
      input.focus();
      choose(t, opts);
    }
    function move(from, step) {
      var all = options(), i = all.indexOf(from) + step;
      if (i < 0) input.focus();
      else if (all[Math.min(i, all.length - 1)]) all[Math.min(i, all.length - 1)].focus();
    }

    input.addEventListener("click", open);
    // The "v" button: shows the input is a dropdown; opens or closes the list without leaving the lookup.
    toggle.setAttribute("aria-controls", id);
    toggle.addEventListener("mousedown", function (e) { e.preventDefault(); });
    toggle.addEventListener("click", function () {
      if (menu.hidden) { input.focus(); open(); } else { close(true); input.focus(); }
    });
    input.addEventListener("input", function () {
      if (menu.hidden) { menu.hidden = false; input.setAttribute("aria-expanded", "true"); }
      render(input.value);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); open(); move(null, 1); }
      else if (e.key === "Escape" && !menu.hidden) { e.preventDefault(); close(true); }
      else if (e.key === "Enter" && !menu.hidden) {
        e.preventDefault();
        var first = options().filter(function (b) { return b.getAttribute("role") === "option"; })[0];
        if (first) first.click();
      }
    });
    menu.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); move(e.target, e.key === "ArrowDown" ? 1 : -1); }
      else if (e.key === "Escape") { e.preventDefault(); close(true); input.focus(); }
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) input.focus();  // keep typing into the lookup
    });
    // Keep focus in the lookup while clicking an option (Safari never focuses clicked buttons).
    menu.addEventListener("mousedown", function (e) { e.preventDefault(); });
    el.addEventListener("focusout", function (e) {
      if (!el.contains(e.relatedTarget)) close(true);
    });
    document.addEventListener("milessic:themechange", function (e) {
      if (opts.apply === false) return;  // the app decides; the picker shows what was picked
      selected = e.detail.key;
      if (menu.hidden) showSelected();
    });
    showSelected();
  }

  window.MilessicThemes = { apply: apply, current: current, list: list, mountPicker: mountPicker, enabled: enabled,
    recent: recent, forgetRecent: forgetRecent, origin: ORIGIN };

  var saved = stored();
  if (saved && saved !== current() && enabled(saved) && (!script || script.dataset.restore !== "false")) apply(saved);
})();
