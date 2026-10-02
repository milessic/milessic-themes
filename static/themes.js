/* milessic-themes client helper (optional).
 *
 *   <link rel="stylesheet" data-milessic-theme href="https://THEMES/css/bundle/system.css">
 *   <script src="https://THEMES/js/themes.js"></script>
 *
 *   MilessicThemes.apply("bevel")          switch theme (sets <html data-theme>, swaps the link)
 *   MilessicThemes.current()               active key
 *   MilessicThemes.list()                  Promise<registry>  (GET /api/themes)
 *   MilessicThemes.mountPicker(el, opts)   render a radio-group picker into el
 *   MilessicThemes.enabled(key)            false if the script tag disabled that theme
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
  var VERSION = script ? new URL(script.src).searchParams.get("v") : null;
  var STORAGE_KEY = "milessic-theme";
  var persist = !script || script.dataset.persist !== "false";
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

  function mountPicker(el, opts) {
    opts = opts || {};
    var name = opts.name || "theme";
    return list().then(function (reg) {
      el.classList.add("theme-grid");
      el.setAttribute("role", "radiogroup");
      el.setAttribute("aria-label", opts.label || "Theme");
      el.innerHTML = "";
      reg.themes.forEach(function (t) {
        var option = document.createElement("label");
        option.className = "theme-option";
        option.title = t.description;
        option.innerHTML =
          '<input type="radio">' +
          '<span class="theme-preview" aria-hidden="true"><span class="tp-window"><span class="tp-bar"></span><span class="tp-btn"></span></span></span>' +
          '<span class="theme-label"></span>';
        var input = option.querySelector("input");
        input.name = name;
        input.value = t.key;
        input.checked = t.key === current();
        option.querySelector(".theme-preview").classList.add("tp-" + t.key);
        option.querySelector(".theme-label").textContent = t.label;
        input.addEventListener("change", function () {
          if (opts.apply !== false) apply(t.key);
          if (opts.onChange) opts.onChange(t.key, t);
        });
        el.appendChild(option);
      });
    });
  }

  window.MilessicThemes = { apply: apply, current: current, list: list, mountPicker: mountPicker, enabled: enabled, origin: ORIGIN };

  var saved = stored();
  if (saved && saved !== current() && enabled(saved) && (!script || script.dataset.restore !== "false")) apply(saved);
})();
