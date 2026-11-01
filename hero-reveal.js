/* Hero headline entrance for the marketing page.
 *
 * From the hero-text-reveal skill. Owns the first-screen <h1> on page entry and
 * nothing else; scroll-reveal.js still owns everything below the fold. The two
 * keep separate namespaces (data-hero-* / --hero-* here, data-scroll-reveal /
 * --reveal-* there) and never share an element, so neither multiplies the
 * other's opacity.
 *
 *   data-hero-reveal="running"  set on the h1 once the split has been made
 *   data-hero-accent="on"       set when the last character has landed
 *   --hero-index                per-character position in the wave
 *
 * The served HTML is the readable fallback: the headline ships as plain text
 * with its gradient already on, and every hidden state lives inside a finite
 * animation with backwards fill. Without this script, or with animations off,
 * the finished composition is what you get.
 */
(() => {
  "use strict";

  const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

  const heading = document.querySelector(".hero-content h1");
  if (!heading || heading.dataset.heroReveal) return;

  const lines = Array.from(heading.querySelectorAll(":scope > .hero-line"));
  if (lines.length === 0) return;

  const motion = window.matchMedia?.(REDUCED_MOTION);

  // Reduced motion gets the served markup untouched: full text, gradient
  // already applied. Splitting it only to hold everything at its final frame
  // would risk a flash and buy nothing. A later switch to no-preference does
  // not start a late entrance over text the visitor has long since read.
  if (motion?.matches) return;

  /* Grapheme clusters, not code units: split("") would cut combining marks and
   * surrogate pairs in half. Without Intl.Segmenter the wave falls back to
   * whole words, which needs no segmentation at all. */
  const segmenter = typeof Intl !== "undefined" && Intl.Segmenter
    ? new Intl.Segmenter(document.documentElement.lang || "en", { granularity: "grapheme" })
    : null;
  const graphemes = word => segmenter
    ? Array.from(segmenter.segment(word), part => part.segment)
    : [word];

  const accessibleName = lines.map(line => line.textContent.trim()).join(" ");
  let index = 0;
  let last = null;

  for (const line of lines) {
    const text = line.textContent;
    const fragment = document.createDocumentFragment();

    // Split on whitespace but keep it: the separators stay real text nodes so
    // wrapping and word spacing behave exactly as they did before, and each
    // word is held together by white-space on .hero-word.
    for (const chunk of text.split(/(\s+)/)) {
      if (chunk === "") continue;
      if (/^\s+$/.test(chunk)) {
        fragment.append(chunk);
        continue;
      }
      const word = document.createElement("span");
      word.className = "hero-word";
      for (const glyph of graphemes(chunk)) {
        const unit = document.createElement("span");
        unit.className = "hero-char";
        unit.style.setProperty("--hero-index", String(index++));
        unit.textContent = glyph;
        word.append(unit);
        last = unit;
      }
      fragment.append(word);
    }

    line.replaceChildren(fragment);
    // One accessible name for the heading, read from the copy below. The split
    // is decoration from here on, so it is not announced character by character.
    line.setAttribute("aria-hidden", "true");
  }

  if (!last) return;

  const spoken = document.createElement("span");
  spoken.className = "hero-a11y";
  spoken.textContent = accessibleName;
  heading.prepend(spoken);

  heading.dataset.heroReveal = "running";

  /* The accent lands on real completion, not on a copied timeout: a longer or
   * translated headline moves it on its own. The clipped gradient is withheld
   * until then because it is painted from the line box rather than the glyphs'
   * own opacity, so it would ignore the wave and arrive all at once. */
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    last.removeEventListener("animationend", onEnd);
    motion?.removeEventListener?.("change", onPreferenceChange);
    heading.dataset.heroAccent = "on";
  };

  const onEnd = event => {
    // heroCharRise is the motion layer's travelling version of the same entrance.
    if (event.target === last && (event.animationName === "heroCharIn" || event.animationName === "heroCharRise")) settle();
  };
  last.addEventListener("animationend", onEnd);

  // Safety net, derived from the same tokens the animation reads, for the cases
  // where animationend never fires (an inactive tab that skips it, a browser
  // that refuses the animation). Never the primary signal.
  const ms = name => Number.parseFloat(getComputedStyle(last).getPropertyValue(name)) || 0;
  const total = ms("--hero-duration") + index * ms("--hero-stagger");
  const timer = window.setTimeout(settle, total + 400);

  // A live switch to reduced motion finishes the sequence at once, accent
  // included, rather than leaving the headline mid-wave in solid ink.
  const onPreferenceChange = event => { if (event.matches) settle(); };
  motion?.addEventListener?.("change", onPreferenceChange);

  // Leaving the page settles rather than abandoning the headline unfinished.
  window.addEventListener("pagehide", settle, { once: true });
})();
