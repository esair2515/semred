/* One-time viewport reveals for the marketing pages.
 *
 * Adapted from the scroll-reveal-motion vanilla controller to this project's
 * convention of plain deferred scripts (see hero-contour.js) rather than modules.
 * The data-attribute contract is unchanged:
 *
 *   data-scroll-reveal="single"    one container
 *   data-scroll-reveal="stagger"   a direct-child group
 *   data-reveal-ready="true"       set only after this script runs
 *   data-reveal-visible="true"     set once, on intersection
 *
 * Content is visible without JavaScript: styles.css only hides an element once
 * data-reveal-ready is present, and the whole rule set sits inside
 * @media (prefers-reduced-motion: no-preference).
 */
(() => {
  "use strict";

  const SELECTOR = '[data-scroll-reveal="single"], [data-scroll-reveal="stagger"]';
  const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

  const elements = Array.from(document.querySelectorAll(SELECTOR))
    .filter(element => element.dataset.revealReady !== "true");
  if (elements.length === 0) return;

  const reveal = element => { element.dataset.revealVisible = "true"; };
  for (const element of elements) element.dataset.revealReady = "true";

  const motion = window.matchMedia?.(REDUCED_MOTION);
  // Reveal at once when motion is unwelcome or the observer is unavailable.
  if (motion?.matches || !("IntersectionObserver" in window)) {
    elements.forEach(reveal);
    return;
  }

  const pending = new Set(elements);
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting || !pending.has(entry.target)) continue;
      reveal(entry.target);
      pending.delete(entry.target);
      observer.unobserve(entry.target);
    }
    if (pending.size === 0) observer.disconnect();
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.16 });

  // A preference change mid-scroll settles everything that has not appeared yet.
  const onPreferenceChange = event => {
    if (!event.matches) return;
    pending.forEach(reveal);
    pending.clear();
    observer.disconnect();
  };
  motion?.addEventListener?.("change", onPreferenceChange);

  elements.forEach(element => observer.observe(element));

  // Leaving the page ends observation rather than holding elements unrevealed.
  window.addEventListener("pagehide", () => {
    motion?.removeEventListener?.("change", onPreferenceChange);
    pending.forEach(reveal);
    pending.clear();
    observer.disconnect();
  }, { once: true });
})();
