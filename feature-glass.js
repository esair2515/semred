/* "Context, not regex" card: a rotating frame, a 3D exploded view of the
 * original, entity and result layers, and a reviewer lens that shows the
 * original under the pointer. Motion layer C; see motion.js for the switch.
 *
 * The served card (four replacement rows) is untouched and stays below the
 * stack. Everything added here is aria-hidden sample text, never real data.
 */
(() => {
  "use strict";

  const motion = window.SemredMotion;
  const feature = document.querySelector("#product .feature");
  const frame = feature?.querySelector(".frame");
  const inner = frame?.querySelector(".frame-inner");
  const text = feature?.querySelector(".feature-text");
  if (!motion || !frame || !inner || !text) return;

  const E = (type, original, replacement) => ({ type, original, replacement });
  const NOTE = [
    E("person", "Bob Smith", "[Patient A]"), ", 58, was seen at ",
    E("organization", "Johns Hopkins", "[Hospital]"), " on ",
    E("date", "March 12, 2024", "[Date]"), " for follow-up of stage II ",
    E("medical_condition", "cancer", "[Condition]"), ". MRN ",
    E("medical_record_number", "448-21-9930", "[MRN]"), ".",
  ];

  const el = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };

  // Both values share one grid cell, so every layer wraps identically and the
  // lens lines up with the result underneath it.
  function aligned(part, show) {
    const cell = el("span", "glass-cell");
    const original = el("span", show === "original" ? "" : "is-ghost", part.original);
    const replacement = el("span", show === "replacement" ? "" : "is-ghost", part.replacement);
    cell.append(original, replacement);
    return cell;
  }
  function layerText(show, wrap) {
    const body = el("div", "glass-text");
    for (const part of NOTE) {
      if (typeof part === "string") body.append(wrap ? el("span", "glass-plain", part) : part);
      else body.append(wrap ? wrap(part, aligned(part, show)) : aligned(part, show));
    }
    return body;
  }

  let built = null;

  function build() {
    const wrap = el("div", "glass-stage");
    wrap.setAttribute("aria-hidden", "true");
    const stack = el("div", "glass-stack");
    const layer = (kind, title, body) => {
      const node = el("div", `glass-layer glass-${kind}`);
      node.append(el("span", "glass-label", title), body);
      return node;
    };
    const tinted = (part, cell) => { const s = el("span", "glass-entity entity-type-" + part.type); s.append(cell); return s; };
    const original = layer("original", "Original", layerText("original", (part, cell) => { const s = el("span", "glass-sensitive"); s.append(cell); return s; }));
    const entities = layer("entities", "Entities", layerText("original", tinted));
    const result = layer("result", "Result", layerText("replacement", (part, cell) => { const s = el("span", "glass-redacted"); s.append(cell); return s; }));
    const lens = el("div", "glass-lens");
    lens.append(layerText("original", tinted));
    const ring = el("span", "glass-ring");
    result.append(lens, ring);
    stack.append(original, entities, result);
    wrap.append(stack);
    inner.prepend(wrap);

    const row = el("div", "glass-actions");
    const button = el("button", "btn-secondary glass-toggle", "Exploded view");
    button.type = "button";
    button.setAttribute("aria-pressed", "false");
    const hint = el("span", "glass-hint", "Hover the card to use the reviewer lens");
    row.append(button, hint);
    const link = text.querySelector(".arrow-link");
    text.insertBefore(row, link);

    const setExploded = on => {
      wrap.classList.toggle("is-exploded", on);
      button.setAttribute("aria-pressed", String(on));
      button.classList.toggle("btn-primary", on);
      button.classList.toggle("btn-secondary", !on);
      button.textContent = on ? "Flatten" : "Exploded view";
      if (on) result.classList.remove("is-lensing");
    };
    button.addEventListener("click", () => setExploded(!wrap.classList.contains("is-exploded")));

    const move = event => {
      if (wrap.classList.contains("is-exploded")) return;
      const box = result.getBoundingClientRect();
      result.style.setProperty("--lx", `${event.clientX - box.left}px`);
      result.style.setProperty("--ly", `${event.clientY - box.top}px`);
      result.classList.add("is-lensing");
    };
    const leave = () => result.classList.remove("is-lensing");
    result.addEventListener("pointermove", move);
    result.addEventListener("pointerdown", move);
    result.addEventListener("pointerleave", leave);

    frame.classList.add("fx-conic");
    const stopWatching = motion.inView(frame, visible => frame.classList.toggle("is-spinning", visible));
    built = { wrap, row, stopWatching, setExploded };
  }

  function teardown() {
    if (!built) return;
    built.stopWatching();
    built.wrap.remove();
    built.row.remove();
    frame.classList.remove("fx-conic", "is-spinning");
    built = null;
  }

  // Opens once on first view so the effect is discoverable, queued behind any
  // other self-playing moment so two never run together.
  motion.once(frame, async () => {
    if (!built) return;
    await motion.sleep(400);
    built?.setExploded(true);
    await motion.sleep(2800);
    built?.setExploded(false);
    await motion.sleep(700);
  }, 0.55);

  const configure = on => (on ? built || build() : teardown());
  motion.onChange(configure);
  configure(motion.enabled);
})();
