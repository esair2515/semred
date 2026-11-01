/* Shared switch and scheduler for the motion layer: hero-contour.js,
 * pipeline-player.js, feature-glass.js and workspace-motion.js.
 *
 * Everything those scripts add is decoration on top of the served page. Turn it
 * all off with MOTION_ENABLED below, or per page with <html data-motion="off">.
 * Reduced motion turns it off as well, and a live change is passed on through
 * onChange, so each script can settle back to the plain page.
 *
 * The scheduler exists so self-playing moments never overlap: the glass card's
 * exploded view and the lifecycle player each wait for the one before.
 */
(() => {
  "use strict";

  const MOTION_ENABLED = true;

  const root = document.documentElement;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const listeners = new Set();

  const enabled = () => MOTION_ENABLED && root.dataset.motion !== "off" && !reduced?.matches;
  // CSS keys every motion rule on data-motion="on"; "off" is left for authors.
  const sync = () => {
    if (root.dataset.motion === "off") return;
    if (enabled()) root.dataset.motion = "on";
    else delete root.dataset.motion;
  };
  sync();

  reduced?.addEventListener?.("change", () => {
    sync();
    listeners.forEach(fn => fn(enabled()));
  });

  /* ---------- one-shot queue ---------- */

  const queue = [];
  let busy = false;
  async function pump() {
    if (busy) return;
    busy = true;
    while (queue.length) {
      const run = queue.shift();
      if (!enabled()) continue;
      try { await run(); } catch (error) { console.error(error); }
    }
    busy = false;
  }

  // Plays fn once, the first time element is at least `threshold` visible.
  function once(element, fn, threshold = 0.45) {
    if (!element || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      queue.push(fn);
      pump();
    }, { threshold });
    observer.observe(element);
  }

  // Calls back with true/false as element enters and leaves the viewport.
  function inView(element, callback, options) {
    if (!element || !("IntersectionObserver" in window)) { callback(true); return () => {}; }
    const observer = new IntersectionObserver(entries => callback(entries.at(-1).isIntersecting), options);
    observer.observe(element);
    return () => observer.disconnect();
  }

  window.SemredMotion = Object.freeze({
    get enabled() { return enabled(); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    once,
    inView,
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  });
})();
