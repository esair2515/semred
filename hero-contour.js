/* Homepage hero: a topographic field behind the headline and a ticker of entity
 * cards that pass through the "Redact files" button. Motion layer A; see
 * motion.js for the switch.
 *
 * Contour lines are isolines of slow-moving gradient noise, traced with
 * marching squares on a coarse grid, coloured from the theme's accent tokens and
 * dented gently by the pointer. Ticker cards are redacted as their centre
 * crosses the button: the button is the gate.
 *
 * Both are decoration. With motion off, reduced motion or no canvas, the field
 * is drawn once and the ticker rests with the cards left of the gate redacted.
 * The loop runs only while the hero is on screen and the tab is visible.
 */
(() => {
  "use strict";

  const hero = document.querySelector(".hero");
  const canvas = hero?.querySelector(".hero-contour");
  const ticker = hero?.querySelector("[data-hero-ticker]");
  if (!hero || !canvas || !ticker) return;

  const motion = window.SemredMotion;
  const moving = () => (motion ? motion.enabled : !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

  /* ---------- ticker ---------- */

  // Entity families map onto the shared entity tokens, so both themes follow.
  const ENTITIES = [
    ["PERSON", "--entity-person-border", 4],
    ["DATE", "--entity-temporal-border", 3],
    ["EMAIL", "--entity-identifier-border", 2],
    ["ORG", "--entity-place-border", 3],
    ["PHONE", "--entity-identifier-border", 2],
    ["MRN", "--entity-health-border", 2],
    ["ADDRESS", "--entity-place-border", 3],
    ["SSN", "--entity-person-border", 2],
    ["IBAN", "--entity-identifier-border", 2],
  ];
  const track = ticker.querySelector(".hero-ticker-track");
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cards = [];
  const items = ENTITIES.map(([name, token, hits]) => {
    // A card's "line of text" is a row of word bars; a few of them are the
    // sensitive spans that turn into redaction marks at the gate.
    const words = Array.from({ length: 14 }, () => 14 + Math.round(random() * 34));
    const sensitive = new Set();
    while (sensitive.size < hits) sensitive.add(1 + Math.floor(random() * 12));
    return { name, token, words, sensitive };
  });
  for (let copy = 0; copy < 2; copy++) {
    for (const item of items) {
      const card = document.createElement("div");
      card.className = "hero-entity";
      const label = document.createElement("span");
      label.className = "hero-entity-name";
      label.textContent = item.name;
      const trace = document.createElement("span");
      trace.className = "hero-entity-trace";
      let order = 0;
      item.words.forEach((width, i) => {
        const word = document.createElement("span");
        word.className = "hero-entity-word";
        word.style.width = `${width}px`;
        if (item.sensitive.has(i)) {
          word.classList.add("is-sensitive");
          word.style.setProperty("--entity-mark", `var(${item.token})`);
          word.style.setProperty("--mark-order", String(order++));
        }
        trace.append(word);
      });
      card.append(label, trace);
      track.append(card);
      cards.push(card);
    }
  }

  let offset = 0;
  let period = 0;
  const measureTrack = () => {
    const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
    period = track.scrollWidth / 2 + gap / 2;
  };

  function placeTicker(dt) {
    if (dt) offset -= 36 * dt / 1000;
    if (period && -offset >= period) offset += period;
    track.style.transform = `translate3d(${offset}px, 0, 0)`;
    const box = ticker.getBoundingClientRect();
    const gate = box.left + box.width / 2;
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const done = rect.left + rect.width / 2 < gate;
      const was = card.classList.contains("is-redacted");
      if (done && !was) {
        card.classList.add("is-redacted");
      } else if (!done && was) {
        // Wrapping round to the right: reset silently, only the crossing animates.
        card.classList.add("is-resetting");
        card.classList.remove("is-redacted");
        void card.offsetWidth;
        card.classList.remove("is-resetting");
      }
    }
  }

  /* ---------- contour field ---------- */

  const ctx = canvas.getContext("2d");
  const CELL = 12;
  const LEVELS = 14;
  const permutation = new Uint8Array(512);
  {
    const values = Array.from({ length: 256 }, (_, i) => i);
    let s = 3;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807) % 2147483647;
      const j = s % (i + 1);
      [values[i], values[j]] = [values[j], values[i]];
    }
    for (let i = 0; i < 512; i++) permutation[i] = values[i & 255];
  }
  const fade = t => t * t * (3 - 2 * t);
  const grad = (h, x, y) => ((h & 1) ? x : -x) + ((h & 2) ? y : -y);
  function noise(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = fade(x);
    const v = fade(y);
    const A = permutation[X] + Y;
    const B = permutation[X + 1] + Y;
    return (1 - v) * ((1 - u) * grad(permutation[A], x, y) + u * grad(permutation[B], x - 1, y))
      + v * ((1 - u) * grad(permutation[A + 1], x, y - 1) + u * grad(permutation[B + 1], x - 1, y - 1));
  }

  // The accent stops come from the active theme; a canvas normalises any CSS colour to hex.
  let palette = [[13, 111, 142], [58, 76, 196], [138, 61, 155]];
  function readPalette() {
    if (!ctx) return;
    const style = getComputedStyle(document.documentElement);
    palette = ["--accent-1", "--accent-2", "--accent-3"].map((name, i) => {
      ctx.fillStyle = "#000";
      ctx.fillStyle = style.getPropertyValue(name).trim() || "#000";
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(ctx.fillStyle);
      return m ? [1, 2, 3].map(k => Number.parseInt(m[k], 16)) : palette[i];
    });
  }
  const mixColor = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const levelColor = level => {
    const t = level / (LEVELS - 1);
    return t < 0.5 ? mixColor(palette[0], palette[1], t * 2) : mixColor(palette[1], palette[2], (t - 0.5) * 2);
  };

  let width = 0;
  let height = 0;
  let cols = 0;
  let rows = 0;
  let field = new Float32Array(0);
  let time = 0;
  let pointerX = -1e4;
  let pointerY = -1e4;
  let dentX = -1e4;
  let dentY = -1e4;

  function sizeCanvas() {
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(width / CELL) + 1;
    rows = Math.ceil(height / CELL) + 1;
    field = new Float32Array(cols * rows);
  }

  function drawField() {
    if (!ctx || !width || !height) return;
    // The pointer's dent eases in and out rather than snapping.
    dentX += (pointerX - dentX) * 0.06;
    dentY += (pointerY - dentY) * 0.06;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = i * CELL;
        const y = j * CELL;
        const dx = x - dentX;
        const dy = y - dentY;
        field[j * cols + i] = noise(x * 0.0022 + time, y * 0.0026 - time * 0.6) * 0.9
          + noise(x * 0.006 - time * 1.3, y * 0.006 + 7) * 0.22
          + 0.28 * Math.exp(-(dx * dx + dy * dy) / 26000);
      }
    }
    ctx.clearRect(0, 0, width, height);
    for (let level = 0; level < LEVELS; level++) {
      const threshold = -0.55 + level * (1.25 / LEVELS);
      const major = level % 5 === 2; // every fifth line is an index contour, as on a survey map
      ctx.strokeStyle = `rgb(${levelColor(level).join(" ")} / ${major ? 0.5 : 0.22})`;
      ctx.lineWidth = major ? 1.25 : 0.8;
      ctx.beginPath();
      for (let j = 0; j < rows - 1; j++) {
        for (let i = 0; i < cols - 1; i++) {
          const a = field[j * cols + i];
          const b = field[j * cols + i + 1];
          const c = field[(j + 1) * cols + i + 1];
          const d = field[(j + 1) * cols + i];
          const cell = (a > threshold) | ((b > threshold) << 1) | ((c > threshold) << 2) | ((d > threshold) << 3);
          if (cell === 0 || cell === 15) continue;
          const x = i * CELL;
          const y = j * CELL;
          const top = [x + CELL * (threshold - a) / (b - a), y];
          const right = [x + CELL, y + CELL * (threshold - b) / (c - b)];
          const bottom = [x + CELL * (threshold - d) / (c - d), y + CELL];
          const left = [x, y + CELL * (threshold - a) / (d - a)];
          const segment = (p, q) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
          switch (cell) {
            case 1: case 14: segment(left, top); break;
            case 2: case 13: segment(top, right); break;
            case 3: case 12: segment(left, right); break;
            case 4: case 11: segment(right, bottom); break;
            case 5: segment(left, top); segment(right, bottom); break;
            case 10: segment(top, right); segment(bottom, left); break;
            case 6: case 9: segment(top, bottom); break;
            case 7: case 8: segment(left, bottom); break;
          }
        }
      }
      ctx.stroke();
    }
  }

  /* ---------- loop ---------- */

  let raf = 0;
  let last = 0;
  let onScreen = true;

  function frame(now) {
    const dt = last ? Math.min(64, now - last) : 16;
    last = now;
    time += dt * 0.000045;
    drawField();
    placeTicker(dt);
    raf = window.requestAnimationFrame(frame);
  }
  function stop() {
    window.cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  }
  function settle() {
    // One still composition: the field as it stands and the ticker at rest.
    stop();
    drawField();
    placeTicker(0);
  }
  function update() {
    if (moving() && onScreen && !document.hidden) {
      if (!raf) raf = window.requestAnimationFrame(frame);
    } else {
      settle();
    }
  }
  const refresh = () => { if (!raf) settle(); };

  hero.addEventListener("pointermove", event => {
    const rect = canvas.getBoundingClientRect();
    pointerX = event.clientX - rect.left;
    pointerY = event.clientY - rect.top;
  });
  hero.addEventListener("pointerleave", () => { pointerX = -1e4; pointerY = -1e4; });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(entries => {
      onScreen = entries.at(-1).isIntersecting;
      update();
    }).observe(hero);
  }
  if ("ResizeObserver" in window) {
    new ResizeObserver(() => { sizeCanvas(); measureTrack(); refresh(); }).observe(hero);
  }
  document.addEventListener("visibilitychange", update);
  motion?.onChange?.(update);
  // The theme switch rewrites data-theme; re-read the accents so the lines follow it.
  new MutationObserver(() => { readPalette(); refresh(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => { readPalette(); refresh(); });

  readPalette();
  sizeCanvas();
  measureTrack();
  offset = -period * 0.3;
  update();
})();
