(function (global) {
  "use strict";

  if (global.hxSPA) return; // already loaded

  const routes = [];
  const listeners = new Set();

  let started = false;
  let lastHref = null;

  let originalPushState = null;
  let originalReplaceState = null;

  function emit() {
    for (const fn of listeners) {
      try { fn(); } catch (e) { console.error("[hxSPA] listener error:", e); }
    }
  }

  function patchHistory() {
    if (originalPushState) return;  // already patched

    originalPushState = history.pushState;
    originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const ret = originalPushState.apply(this, args);
      emit();
      return ret;
    };

    history.replaceState = function (...args) {
      const ret = originalReplaceState.apply(this, args);
      emit();
      return ret;
    };

    global.addEventListener("popstate", emit);
    global.addEventListener("hashchange", emit);
  }

  function unpatchHistory() {
    if (!originalPushState) return; // not patched

    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    originalPushState = null;
    originalReplaceState = null;

    global.removeEventListener("popstate", emit);
    global.removeEventListener("hashchange", emit);
  }

  const activeCleanups = new Set();

  function cleanupAll() {
    for (const fn of activeCleanups) {
      try { fn(); } catch (e) { console.error("[hxSPA] cleanup error:", e); }
    }
    activeCleanups.clear();
  }

  function run() {
    const href = location.href;
    if (href === lastHref) return;
    lastHref = href;

    const url = new URL(href);

    cleanupAll();

    for (const r of routes) {
      let match = false;
      try {
        match = !!r.predicate(url, href);
      } catch (e) {
        console.error("[hxSPA] predicate error:", e);
        continue;
      }
      if (!match) continue;

      try {
        const ret = r.handler(url, href);

        if (typeof ret === "function") activeCleanups.add(ret);
        if (typeof r.cleanup === "function") activeCleanups.add(r.cleanup);
      } catch (e) {
        console.error("[hxSPA] handler error:", e);
      }

      if (r.once) break;
    }
  }

  function registerRoute(predicate, handler, options) {
    if (typeof predicate !== "function") throw new TypeError("predicate must be a function");
    if (typeof handler !== "function") throw new TypeError("handler must be a function");

    const r = {
      predicate,
      handler,
      cleanup: options && options.cleanup,
      once: !!(options && options.once),
    };
    routes.push(r);

    // If already started, evaluate immediately
    if (started) run();

    // Return an unregister function
    return function unregister() {
      const idx = routes.indexOf(r);
      if (idx >= 0) routes.splice(idx, 1);
    };
  }

  function onUrlChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function start() {
    if (started) return;
    started = true;
    patchHistory();

    // Default listener: run router
    listeners.add(run);

    // Initial run
    run();
  }

  function stop() {
    if (!started) return;
    started = false;

    listeners.clear();
    cleanupAll();
    unpatchHistory();
    lastHref = null;
  }

  global.hxSPA = {
    registerRoute,
    onUrlChange,
    start,
    stop,
    run,
  };
})(typeof window !== "undefined" ? window : globalThis);
