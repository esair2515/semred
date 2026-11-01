/* Redaction lifecycle player. Motion layer B; see motion.js for the switch.
 *
 * The section scrolls like any other. Nothing here is tied to scroll position:
 * only Play, the scrubber or a stage card move the playhead, apart from a
 * one-stage teaser the first time the cards come into view. One clinical note
 * goes through Detect, Canonicalize, Rewrite, Score and Audit, and each removed
 * value travels as particles into its audit row.
 *
 * Every frame is a pure function of the playhead, so pausing, scrubbing back
 * and replaying always land on the same picture. The served section (five
 * stage cards with their full copy) is the fallback: with motion off nothing
 * below is added, and switching motion off mid-visit puts it back.
 */
(() => {
  "use strict";

  const motion = window.SemredMotion;
  const section = document.getElementById("pipeline");
  const controls = document.getElementById("pipelinePlayer");
  if (!motion || !section || !controls) return;

  const shell = section.querySelector(".shell");
  const grid = section.querySelector(".pipeline");
  const heading = section.querySelector(".section-header h2");
  const playButton = document.getElementById("pipelinePlay");
  const scrub = document.getElementById("pipelineScrub");
  const tip = document.getElementById("pipelineTip");
  const tipClose = document.getElementById("pipelineTipClose");
  const stages = [...grid.querySelectorAll(".stage")];

  /* ---------- the sample note ---------- */

  const E = (type, label, original, replacement) => ({ type, label, original, replacement });
  const NOTE = [
    E("person", "PERSON", "Bob Smith", "[Patient A]"), ", 58, was seen at ",
    E("organization", "ORG", "Johns Hopkins", "[Hospital]"), " on ",
    E("date", "DATE", "March 12, 2024", "[Date]"), " for follow-up of stage II ",
    E("medical_condition", "CONDITION", "cancer", "[Condition]"), ". MRN ",
    E("medical_record_number", "ID", "448-21-9930", "[MRN]"), ". ",
    E("person", "PERSON", "Mr. Smith", "[Patient A]"), " asked that his daughter ",
    E("person", "PERSON", "Ana Smith", "[Relative B]"), " be called at ",
    E("phone", "PHONE", "(410) 555-0187", "[Phone]"), ".",
  ];
  const SIMILARITY = 0.94;
  const NOTES = ["deterministic stage", "semantic review accepted", "rule matched"];
  const entities = NOTE.filter(part => typeof part !== "string");
  const count = entities.length;

  /* ---------- timeline ---------- */

  const clamp = value => Math.min(1, Math.max(0, value));
  const smooth = t => t * t * (3 - 2 * t);
  const local = (p, start, length) => clamp((p - start) / length);
  // Each stage owns a fifth of the playhead; its action sits inside that window
  // with a still moment on either side, so every stage can be read.
  const at = (stage, i) => stage * 0.2 + 0.03 + (count > 1 ? i / (count - 1) : 0) * 0.12;
  const DURATION = 9000;

  /* ---------- built only while motion is on ---------- */

  let built = null;
  let position = 0;
  let playing = false;
  let frame = 0;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function build() {
    const added = [];
    const keep = node => { added.push(node); return node; };

    // Kinetic headline: one weight wave per play. The h2 keeps its own name.
    const headingText = heading.textContent;
    heading.setAttribute("aria-label", headingText);
    const chars = [...headingText].map(ch => {
      const span = el("span", "kin-char", ch);
      span.setAttribute("aria-hidden", "true");
      return span;
    });
    heading.replaceChildren(...chars);

    // Stage cards become jump targets; their copy moves into the reading line.
    const jumps = stages.map((stage, i) => {
      const button = keep(el("button", "stage-jump"));
      button.type = "button";
      button.setAttribute("aria-label", `Show the ${stage.querySelector("h3").textContent} stage`);
      button.addEventListener("click", () => { markUsed(); pause(); setPosition(i * 0.2 + 0.19); });
      stage.append(button);
      return button;
    });
    const descs = keep(el("div", "player-descs"));
    descs.setAttribute("aria-hidden", "true");
    const descLines = stages.map(stage => {
      const line = el("p", "player-desc");
      line.append(el("b", "", `${stage.querySelector("h3").textContent}. `), stage.querySelector("p").textContent);
      descs.append(line);
      return line;
    });
    grid.after(descs);

    // The note, the similarity meter and the audit log. Decorative: the same
    // facts are in the stage copy above, which stays readable.
    const demo = keep(el("div", "player-demo"));
    demo.setAttribute("aria-hidden", "true");
    const doc = el("div", "player-doc");
    doc.append(el("span", "code-label", "Discharge summary · sample"));
    const text = el("div", "player-text");
    const spans = [];
    for (const part of NOTE) {
      if (typeof part === "string") { text.append(part); continue; }
      const span = el("span", `player-span entity-type-${part.type}`);
      const id = part.replacement.match(/ ([AB])\]/);
      span.append(
        el("span", "player-tag", `${part.label}${id ? `·${id[1]}` : ""}`),
        el("span", "player-from", part.original),
        el("span", "player-to", part.replacement),
      );
      text.append(span);
      spans.push(span);
    }
    doc.append(text);
    const side = el("div", "player-side");
    const meter = el("div", "player-meter");
    const meterHead = el("div", "player-meter-head");
    const meterValue = el("span", "player-meter-value", "—");
    meterHead.append(el("span", "metric-label", "Similarity"), meterValue);
    const meterFill = el("span", "player-meter-fill");
    const meterTrack = el("div", "player-meter-track");
    meterTrack.append(meterFill);
    meter.append(meterHead, meterTrack);
    const log = el("div", "player-log");
    const rows = entities.map((part, i) => {
      const row = el("div", "player-log-row");
      const kind = el("span", `player-log-kind entity-type-${part.type}`, part.label);
      row.append(el("time", "", `14:02:${String(11 + (i >> 1)).padStart(2, "0")}`), kind, ` replaced · ${NOTES[i % 3]}`);
      log.append(row);
      return row;
    });
    side.append(meter, log);
    demo.append(doc, side);
    descs.after(demo);

    const canvas = keep(el("canvas", "player-particles"));
    canvas.setAttribute("aria-hidden", "true");
    shell.append(canvas);

    // Seeded so every play draws the same particles at the same playhead.
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const seeds = entities.map(() => Array.from({ length: 24 }, () => ({
      ox: random(), oy: random(), tx: random(), d: 0.55 + random() * 0.45, s: 1 + random() * 2, wob: (random() - 0.5) * 140,
    })));

    section.classList.add("is-player");
    controls.hidden = false;
    const resizer = new ResizeObserver(() => { sizeCanvas(); render(); });
    resizer.observe(shell);
    built = { added, chars, jumps, descLines, spans, rows, meterFill, meterValue, canvas, ctx: canvas.getContext("2d"), seeds, headingText, resizer };
    sizeCanvas();
  }

  function teardown() {
    if (!built) return;
    pause();
    built.resizer.disconnect();
    built.added.forEach(node => node.remove());
    heading.textContent = built.headingText;
    heading.removeAttribute("aria-label");
    stages.forEach(stage => { stage.style.removeProperty("--p"); stage.classList.remove("is-active", "is-done"); });
    section.classList.remove("is-player");
    controls.hidden = true;
    tip.hidden = true;
    pointPending = false;
    playButton.classList.remove("is-breathing");
    built = null;
  }

  function sizeCanvas() {
    if (!built) return;
    const density = Math.min(window.devicePixelRatio || 1, 2);
    built.canvas.width = Math.round(shell.clientWidth * density);
    built.canvas.height = Math.round(shell.clientHeight * density);
    built.ctx.setTransform(density, 0, 0, density, 0, 0);
  }

  /* ---------- one frame ---------- */

  function render() {
    if (!built) return;
    const p = position;
    const { chars, descLines, spans, rows, meterFill, meterValue, canvas, ctx, seeds } = built;

    // Reads first, then writes.
    const base = shell.getBoundingClientRect();
    const spanBoxes = spans.map(span => span.getBoundingClientRect());
    const rowBoxes = rows.map(row => row.getBoundingClientRect());
    const colors = spans.map(span => getComputedStyle(span).getPropertyValue("--entity-border").trim());

    const phase = Math.min(4, Math.floor(p * 5));
    stages.forEach((stage, i) => {
      stage.style.setProperty("--p", clamp(p * 5 - i).toFixed(3));
      stage.classList.toggle("is-active", i === phase && p > 0 && p < 1);
      stage.classList.toggle("is-done", i < phase || p >= 1);
    });
    descLines.forEach((line, k) => {
      const lo = k === 0 ? -1 : k * 0.2;
      const hi = k === 4 ? 2 : (k + 1) * 0.2;
      // A short crossfade, so a playhead resting at a stage's end (0.19, 0.39…,
      // where the teaser and the stage cards stop) shows one line, not two.
      line.style.opacity = clamp((Math.min(p - lo, hi - p) + 0.008) / 0.016).toFixed(3);
    });
    spans.forEach((span, i) => {
      span.classList.toggle("is-hit", p >= at(0, i));
      const flip = smooth(local(p, at(2, i), 0.03));
      span.classList.toggle("is-tagged", p >= at(1, i) && flip === 0);
      span.style.setProperty("--flip", flip.toFixed(3));
    });
    const scored = smooth(local(p, 0.63, 0.14));
    meterFill.style.transform = `scaleX(${(scored * SIMILARITY).toFixed(3)})`;
    meterValue.textContent = scored > 0 ? (scored * SIMILARITY).toFixed(2) : "—";
    rows.forEach((row, i) => {
      const shown = smooth(local(p, at(4, i), 0.03));
      row.style.opacity = shown.toFixed(3);
      row.style.transform = `translateX(${(10 * (1 - shown)).toFixed(1)}px)`;
    });
    chars.forEach((ch, i) => {
      const weight = p > 0 && p < 1 ? 380 + 260 * Math.max(0, Math.cos((i / chars.length - p) * 6)) : 500;
      ch.style.fontWeight = weight.toFixed(0);
    });

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    entities.forEach((part, i) => {
      const start = at(2, i);
      for (const q of seeds[i]) {
        const e = local(p, start, 0.12 * q.d);
        if (e <= 0 || e >= 1) continue;
        const k = 1 - (1 - e) ** 3;
        const arc = Math.sin(e * Math.PI);
        const from = spanBoxes[i];
        const to = rowBoxes[i];
        const x0 = from.left - base.left + q.ox * from.width;
        const y0 = from.top - base.top + q.oy * from.height;
        const x1 = to.left - base.left + 20 + q.tx * 60;
        const y1 = to.top - base.top + to.height / 2;
        ctx.globalAlpha = arc;
        ctx.fillStyle = colors[i];
        ctx.beginPath();
        ctx.arc(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k + arc * (q.wob * 0.4 - 50), q.s, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    scrub.value = String(Math.round(p * 1000));
  }

  /* ---------- playback ---------- */

  const playLabel = playButton.querySelector(".player-play-label");
  let finish = null; // called once when the current run stops, however it stops

  function label() {
    playLabel.textContent = playing ? "Pause" : position >= 1 ? "Replay" : "Play";
    playButton.classList.toggle("is-playing", playing);
    playButton.setAttribute("aria-pressed", String(playing));
  }
  function setPosition(value) {
    position = clamp(value);
    render();
    label();
  }
  function settle() {
    const done = finish;
    finish = null;
    if (done) done();
  }
  function pause() {
    playing = false;
    cancelAnimationFrame(frame);
    label();
    settle();
  }
  // Plays from the playhead to stopAt (the end, unless the teaser asks for less).
  function play(stopAt = 1, done = null) {
    if (!built) return;
    cancelAnimationFrame(frame);
    settle();
    finish = done;
    if (position >= 1) position = 0;
    playing = true;
    let last = performance.now();
    const tick = now => {
      if (!playing) return;
      setPosition(Math.min(stopAt, position + (now - last) / DURATION));
      last = now;
      if (position >= stopAt) pause();
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    label();
  }

  playButton.addEventListener("click", () => {
    const teasing = Boolean(finish);
    markUsed();
    // Pressing Play during the teaser turns it into a normal play from there.
    if (playing && !teasing) pause();
    else play();
  });
  scrub.addEventListener("input", () => { markUsed(); pause(); setPosition(Number(scrub.value) / 1000); });

  /* ---------- first-visit teaser and hint ---------- */
  // The first time the cards are half on screen, Detect plays by itself and
  // stops; then Play breathes three times and a tip points at it. The hint
  // comes back every visit until the reader uses the player (Play, the
  // scrubber or a stage card). Closing the tip hides it for this visit only.

  const USED_KEY = "semred.pipelinePlayerUsed.v1";
  const TEASER_END = 0.19; // the end of Detect, where a stage card jump also lands
  let usedNow = false;
  let visible = false;
  let pointPending = false;

  const used = () => {
    if (usedNow) return true;
    try { return localStorage.getItem(USED_KEY) === "1"; } catch { return false; }
  };
  function markUsed() {
    usedNow = true;
    try { localStorage.setItem(USED_KEY, "1"); } catch { /* storage unavailable */ }
    hideHint();
  }
  function hideHint() {
    pointPending = false;
    playButton.classList.remove("is-breathing");
    if (tip.hidden || tip.classList.contains("is-leaving")) return;
    tip.classList.add("is-leaving");
    setTimeout(() => { tip.hidden = true; tip.classList.remove("is-leaving"); }, 300);
  }
  // Waits until the section is on screen, so the breaths are not spent unseen.
  function pointAtPlay() {
    if (!built || used()) return;
    if (!visible) { pointPending = true; return; }
    pointPending = false;
    const bar = controls.getBoundingClientRect();
    const button = playButton.getBoundingClientRect();
    controls.style.setProperty("--tip-caret", `${bar.right - (button.left + button.width / 2)}px`);
    tip.hidden = false;
    playButton.classList.remove("is-breathing");
    void playButton.offsetWidth; // restart the breaths
    playButton.classList.add("is-breathing");
  }
  // Resolves when the teaser stops, so the motion queue can move on.
  const teaser = () => new Promise(resolve => {
    if (!built || used() || playing || position > 0) { resolve(); return; }
    play(TEASER_END, () => { pointAtPlay(); resolve(); });
  });

  playButton.addEventListener("animationend", () => playButton.classList.remove("is-breathing"));
  tipClose.addEventListener("click", hideHint);
  // Playback stops when the reader scrolls away.
  motion.inView(section, isVisible => {
    visible = isVisible;
    if (!isVisible) pause();
    else if (pointPending) pointAtPlay();
  });
  // Queued, so it waits for any earlier self-playing moment instead of playing over it.
  motion.once(grid, async () => { await motion.sleep(600); await teaser(); }, 0.5);

  /* ---------- switch ---------- */

  const configure = on => {
    if (on && !built) { build(); setPosition(position); }
    else if (!on) teardown();
  };
  motion.onChange(configure);
  configure(motion.enabled);
})();
