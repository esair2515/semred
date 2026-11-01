/* Loaded in <head> so every page uses the saved theme before its first paint. */

/* One local address. localhost and 127.0.0.1 are separate sites to the browser,
 * each with its own saved name, theme and sidebar state, so localhost redirects to
 * the same page on 127.0.0.1 (the address the API uses) and carries those saved
 * settings along. Settings already saved on 127.0.0.1 are kept. */
(() => {
  const CARRY = "semred_carry";
  try {
    const here = window.location;
    // Only normalize browser-served pages. Tauri's packaged asset protocol
    // requires tauri://localhost; rewriting that host makes every asset miss
    // and fall back to index.html (including CSS, JS, and dashboard.html).
    if ((here.protocol === "http:" || here.protocol === "https:")
        && (here.hostname === "localhost" || here.hostname === "[::1]")) {
      const saved = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i), value = localStorage.getItem(key);
        if (value != null && value.length <= 2000) saved[key] = value;
      }
      const target = new URL(here.href);
      target.hostname = "127.0.0.1";
      if (Object.keys(saved).length) target.searchParams.set(CARRY, JSON.stringify(saved));
      document.documentElement.style.visibility = "hidden";
      here.replace(target.href);
      return;
    }
    const url = new URL(here.href);
    const carried = url.searchParams.get(CARRY);
    if (carried == null) return;
    url.searchParams.delete(CARRY);
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    const saved = JSON.parse(carried);
    for (const [key, value] of Object.entries(saved)) {
      if (localStorage.getItem(key) == null && typeof value === "string") localStorage.setItem(key, value);
    }
  } catch { /* Without storage or URL support the page still works on either address. */ }
})();

/* The collapsible sidebar (sidebar.js) is restored here too, so a collapsed
 * sidebar never paints open and then snaps shut. */
try {
  if (localStorage.getItem("semred.sidebar") === "collapsed") document.documentElement.dataset.sidebar = "collapsed";
} catch { /* Storage is optional; the sidebar then starts open. */ }

(() => {
  /* Three preferences, two resolved values. "system" is resolved here rather than
   * in a CSS media query so every colour literal can stay inside the two token
   * blocks in app.css, and so the resolved value is always readable from
   * document.documentElement.dataset.theme. */
  const PREFERENCES = ["light", "dark", "system"];
  const DARK_QUERY = "(prefers-color-scheme: dark)";

  const ICONS = {
    light: '<circle cx="8" cy="8" r="3.2"/><path d="M8 1v1.7M8 13.3V15M15 8h-1.7M2.7 8H1M12.9 3.1l-1.2 1.2M4.3 11.7l-1.2 1.2M12.9 12.9l-1.2-1.2M4.3 4.3L3.1 3.1"/>',
    dark: '<path d="M13.6 9.5A5.9 5.9 0 0 1 6.5 2.4a5.9 5.9 0 1 0 7.1 7.1z"/>',
    system: '<rect x="1.8" y="2.6" width="12.4" height="8.6" rx="1.4"/><path d="M5.6 13.8h4.8M8 11.2v2.6"/>',
  };
  const LABELS = { light: "Light", dark: "Dark", system: "System" };

  let preference = "system";

  function systemTheme() {
    try {
      return window.matchMedia && window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
    } catch {
      return "light"; // Treat an unavailable media query as the light default.
    }
  }

  function resolve(value) {
    if (value === "dark" || value === "light") return value;
    return systemTheme();
  }

  function apply() {
    const resolved = resolve(preference);
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.themePref = preference;
    document.querySelectorAll?.("[data-theme-option]").forEach(option => {
      option.setAttribute("aria-pressed", String(option.dataset.themeOption === preference));
    });
  }

  /* The swap itself is instant; what follows only decides how it is revealed.
   * A soft-edged circle grows from the control that was pressed (or from the
   * middle of the viewport when the change came from the OS or another tab).
   * Anything that cannot run that -- reduced motion, no View Transitions --
   * still gets the correct theme, just without the sweep. */
  const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let fadeTimer = 0;
  let activeSweep = null;

  function reveal(origin) {
    const root = document.documentElement;
    if (REDUCED_MOTION?.matches) {
      apply();
      return;
    }
    const width = window.innerWidth;
    const height = window.innerHeight;
    const x = origin ? origin.x : width / 2;
    const y = origin ? origin.y : height / 2;
    // Reach the furthest corner, so the sweep always finishes off-screen.
    const reach = Math.ceil(Math.hypot(Math.max(x, width - x), Math.max(y, height - y)));

    if (!document.startViewTransition) {
      root.dataset.themeFade = "true";
      clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => { delete root.dataset.themeFade; }, 520);
      apply();
      return;
    }

    // app.css owns the timing; read it back rather than restating it here.
    const styles = getComputedStyle(root);
    const duration = parseFloat(styles.getPropertyValue("--duration-theme")) || 760;
    const easing = styles.getPropertyValue("--ease-theme").trim() || "ease";

    root.dataset.themeAnim = "sweep";
    const transition = document.startViewTransition(() => apply());
    // A second click skips the first transition; only the last one may undress
    // the mask, or the sweep still running would snap to its end.
    activeSweep = transition;
    const clear = () => {
      if (activeSweep === transition) delete root.dataset.themeAnim;
    };
    transition.finished.then(clear, clear);
    transition.ready.then(() => {
      // The mask reads these off the pseudo-element itself, so nothing depends
      // on custom properties inheriting into the view-transition tree.
      const frame = progress => ({
        "--theme-progress": progress,
        "--theme-origin-x": `${x}px`,
        "--theme-origin-y": `${y}px`,
        "--theme-reach": `${reach}px`,
      });
      root.animate([frame(0), frame(1)], {
        duration,
        easing,
        fill: "both",
        pseudoElement: "::view-transition-new(root)",
      });
    }, () => { /* Skipped transitions (a hidden tab) still land on the theme. */ });
  }

  function setTheme(theme, persist = true, origin = null) {
    const next = PREFERENCES.includes(theme) ? theme : "light";
    const changed = resolve(next) !== resolve(preference);
    preference = next;
    if (persist) {
      try { localStorage.setItem("theme", preference); } catch { /* Storage can be disabled. */ }
    }
    // Only the resolved value is worth animating; light -> system on a light OS
    // changes which button is pressed and nothing else.
    if (changed) reveal(origin);
    else apply();
  }

  let savedTheme = null;
  try { savedTheme = localStorage.getItem("theme"); } catch { /* Use the default. */ }
  // Anything unrecognised, including a first visit, follows the operating system.
  preference = PREFERENCES.includes(savedTheme) ? savedTheme : "system";
  apply();

  // Track the OS while, and only while, the visitor has not chosen for themselves.
  const media = window.matchMedia?.(DARK_QUERY);
  const onSystemChange = () => { if (preference === "system") reveal(null); };
  media?.addEventListener?.("change", onSystemChange);

  window.addEventListener("storage", event => {
    if (event.key === "theme" || event.key === null) setTheme(event.newValue, false);
  });

  /* One control, rendered wherever a page marks a slot for it. */
  function buildSwitch(host) {
    const labelled = host.dataset.themeSwitch === "labelled";
    host.setAttribute("role", "group");
    if (!host.hasAttribute("aria-label")) host.setAttribute("aria-label", "Theme");
    host.textContent = "";
    for (const value of PREFERENCES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "theme-option";
      button.dataset.themeOption = value;
      button.setAttribute("aria-pressed", String(value === preference));
      button.setAttribute("aria-label", `${LABELS[value]} theme`);
      if (!labelled) button.title = LABELS[value];
      button.innerHTML =
        `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="none" ` +
        `stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${ICONS[value]}</svg>`;
      if (labelled) {
        const text = document.createElement("span");
        text.textContent = LABELS[value];
        button.appendChild(text);
      }
      button.addEventListener("click", event => {
        // Keyboard activation reports 0,0; fall back to the button's own centre.
        const box = button.getBoundingClientRect();
        const fromPointer = event.clientX || event.clientY;
        setTheme(value, true, fromPointer
          ? { x: event.clientX, y: event.clientY }
          : { x: box.left + box.width / 2, y: box.top + box.height / 2 });
      });
      host.appendChild(button);
    }
  }

  // A deployment may set window.SEMRED_API_BASE before this script loads.
  const { hostname, origin, protocol } = window.location;
  let apiBase = origin;
  if ((protocol === "http:" || protocol === "https:")
      && (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]")) {
    // Uvicorn is normally bound to IPv4 127.0.0.1. Safari can resolve
    // localhost to ::1 first, so use the explicit IPv4 loopback for local UI
    // sessions unless an API base was supplied by the deployment.
    apiBase = `${protocol}//127.0.0.1:8000`;
  } else if (hostname.endsWith(".app.github.dev")) {
    apiBase = `${protocol}//${hostname.replace(/-\d+(?=\.app\.github\.dev$)/, "-8000")}`;
  }
  const tauriInvoke = window.__TAURI__?.core?.invoke;
  const desktopMode = typeof tauriInvoke === "function";
  const desktopConfigPromise = desktopMode
    ? tauriInvoke("desktop_api_config").catch(() => { throw new Error("The local SemRed service did not start."); })
    : Promise.resolve(null);
  let resolvedApiBase = String(window.SEMRED_API_BASE || apiBase).replace(/\/$/, "");
  if (desktopMode) desktopConfigPromise.then(config => {
    resolvedApiBase = String(config.apiBase).replace(/\/$/, "");
  }).catch(() => {});
  const workspaceStorageKey = "semred-workspace-id";
  let workspaceRecords = [];
  let workspaceLoadPromise;
  function workspaceHeaderId() {
    try { return localStorage.getItem(workspaceStorageKey) || ""; } catch { return ""; }
  }
  function setWorkspaceId(id) {
    try { id ? localStorage.setItem(workspaceStorageKey, id) : localStorage.removeItem(workspaceStorageKey); }
    catch { /* The server still defaults to the private workspace. */ }
  }
  async function apiFetch(input, options = {}) {
    const desktopConfig = desktopMode ? await desktopConfigPromise : null;
    const base = desktopConfig?.apiBase || resolvedApiBase;
    let url = new URL(input, base);
    // Page scripts may form API URLs before desktop_api_config resolves. Route
    // every Tauri asset URL to the sidecar instead of trying to fetch through
    // the asset protocol; custom-scheme origins vary across WebViews.
    if (desktopConfig && (url.protocol === "tauri:" || url.origin === location.origin)) {
      url = new URL(`${url.pathname}${url.search}${url.hash}`, base);
    }
    const headers = new Headers(options.headers || {});
    if (desktopConfig && url.origin === new URL(base).origin) headers.set("X-API-Key", desktopConfig.apiKey);
    if (desktopConfig && url.origin === new URL(base).origin) {
      try {
        const sessionToken = sessionStorage.getItem("semred.local-session");
        if (sessionToken) headers.set("Authorization", `Bearer ${sessionToken}`);
      } catch { /* A missing session token is rejected by the backend. */ }
    }
    if (url.origin === new URL(base).origin) {
      const workspaceId = workspaceHeaderId();
      if (workspaceId) headers.set("X-Workspace-ID", workspaceId);
    }
    const response = await fetch(url, { ...options, headers, credentials: "include" });
    const isLocalAuthRoute = url.pathname.startsWith("/auth/local/");
    if (desktopConfig && response.status === 401 && !isLocalAuthRoute && !document.body.classList.contains("auth-body")) {
      try { sessionStorage.removeItem("semred.local-session"); } catch { /* Best effort. */ }
      const next = `${location.pathname.split("/").pop()}${location.search}${location.hash}`;
      location.replace(`signin.html?next=${encodeURIComponent(next)}`);
    }
    return response;
  }
  workspaceLoadPromise = Promise.resolve([]);

  async function refreshWorkspaceState() {
    const res = await apiFetch(`${resolvedApiBase}/workspaces`);
    if (!res.ok) throw new Error("Could not load workspaces.");
    workspaceRecords = await res.json();
    return workspaceRecords;
  }

  /* Create an organization workspace: an in-page dialog instead of window.prompt.
   * The name previews as the workspace's badge while it is typed; the button shows
   * progress, then a check, before the page switches to the new workspace. */
  function openCreateWorkspace(workspaces) {
    const opener = document.getElementById("sidebarAccount");
    const dialog = document.createElement("dialog");
    dialog.className = "ws-dialog";
    dialog.setAttribute("aria-labelledby", "wsDialogTitle");
    dialog.setAttribute("aria-describedby", "wsDialogLead");
    dialog.innerHTML = `
      <form class="ws-dialog-card" method="dialog" novalidate>
        <div class="ws-dialog-head">
          <span class="ws-dialog-mark" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 2.5 13.5 5.25 8 8 2.5 5.25zM2.5 8 8 10.75 13.5 8M2.5 10.75 8 13.5l5.5-2.75"/></svg></span>
          <button type="button" class="ws-dialog-x" aria-label="Close" data-close><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg></button>
        </div>
        <h2 id="wsDialogTitle">New organization workspace</h2>
        <p id="wsDialogLead" class="ws-dialog-lead">A shared space for your team. Projects and releases here are visible to the members you add; your private workspace stays separate.</p>
        <label class="ws-field" for="wsDialogName">
          <span class="ws-field-label">Workspace name</span>
          <span class="ws-field-box">
            <span class="ws-preview" aria-hidden="true">?</span>
            <input id="wsDialogName" name="name" type="text" maxlength="120" autocomplete="off" spellcheck="false" placeholder="e.g. Acme Health" required>
            <span class="ws-count" aria-hidden="true">0/120</span>
          </span>
        </label>
        <p class="ws-hint" role="status" aria-live="polite"></p>
        <div class="ws-dialog-actions">
          <button type="button" class="ws-btn ws-btn-quiet" data-close>Cancel</button>
          <button type="submit" class="ws-btn ws-btn-go" disabled>
            <span class="ws-btn-face"><span class="ws-btn-label">Create workspace</span><svg class="ws-btn-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9M9 4.5 12.5 8 9 11.5"/></svg></span>
            <span class="ws-btn-spin" aria-hidden="true"></span>
            <svg class="ws-btn-done" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5"/></svg>
          </button>
        </div>
      </form>`;
    document.body.append(dialog);
    const form = dialog.querySelector("form");
    const input = dialog.querySelector("input");
    const preview = dialog.querySelector(".ws-preview");
    const count = dialog.querySelector(".ws-count");
    const hint = dialog.querySelector(".ws-hint");
    const submit = dialog.querySelector(".ws-btn-go");
    const label = dialog.querySelector(".ws-btn-label");
    const taken = new Set(workspaces.map(item => item.name.trim().toLowerCase()));
    let busy = false;

    const setHint = (text, tone = "") => { hint.textContent = text; hint.dataset.tone = tone; };
    function sync() {
      const name = input.value.trim();
      preview.textContent = name ? name.charAt(0).toUpperCase() : "?";
      preview.classList.toggle("is-set", Boolean(name));
      count.textContent = `${input.value.length}/120`;
      count.classList.toggle("is-near", input.value.length > 100);
      submit.disabled = !name || busy;
      input.removeAttribute("aria-invalid");
      if (name && taken.has(name.toLowerCase())) setHint("You already have a workspace with this name. You can still create it.", "warn");
      else setHint("");
    }
    function close() {
      if (busy || dialog.classList.contains("is-closing")) return;
      dialog.classList.add("is-closing");
      const done = () => { dialog.close(); dialog.remove(); opener?.focus({ preventScroll: true }); };
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) done();
      else setTimeout(done, 150);
    }
    function reject(message) {
      input.setAttribute("aria-invalid", "true");
      setHint(message, "error");
      form.classList.remove("shake");
      void form.offsetWidth;
      form.classList.add("shake");
      input.focus();
    }

    input.addEventListener("input", sync);
    dialog.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", close));
    dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
    // A press that starts and ends on the backdrop closes it; a drag out of the input does not.
    let downOnBackdrop = false;
    dialog.addEventListener("pointerdown", event => { downOnBackdrop = event.target === dialog; });
    dialog.addEventListener("click", event => { if (downOnBackdrop && event.target === dialog) close(); });
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) { reject("Give the workspace a name."); return; }
      if (busy) return;
      busy = true;
      submit.disabled = true;
      submit.dataset.state = "busy";
      label.textContent = "Creating…";
      input.readOnly = true;
      try {
        const res = await apiFetch(`${resolvedApiBase}/workspaces`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => ({}));
          throw new Error(typeof detail.detail === "string" ? detail.detail : "Could not create the workspace. Try again.");
        }
        const created = await res.json();
        submit.dataset.state = "done";
        label.textContent = "Created";
        setHint(`Switching to ${created.name}…`, "ok");
        setWorkspaceId(created.id);
        await refreshWorkspaceState().catch(() => {});
        setTimeout(() => { location.href = "projects.html"; }, 520);
      } catch (error) {
        busy = false;
        input.readOnly = false;
        delete submit.dataset.state;
        label.textContent = "Create workspace";
        submit.disabled = false;
        reject(error.message || "Could not create the workspace. Try again.");
      }
    });

    dialog.showModal();
    input.focus();
    sync();
  }

  // The workspace switcher lives in the sidebar's account menu, above Account: one row
  // names the current workspace and opens a submenu (wired by sidebar.js) that switches
  // workspace, creates an organization workspace and, for owners, manages members.
  async function buildWorkspaceControls() {
    const accountMenu = document.getElementById("sidebarAccountMenu");
    if (!accountMenu) return;
    const workspaces = await workspaceLoadPromise;
    if (!workspaces.length) return;
    const current = workspaces.find(item => item.id === workspaceHeaderId()) || workspaces[0];
    const kindLabel = item => (item.kind === "organization" ? "Shared" : "Private");
    // "Private workspace · Private" says it twice; the tag is left out when the name already says it.
    const kindTag = item => (item.name.toLowerCase().includes(kindLabel(item).toLowerCase()) ? "" : kindLabel(item));
    const icon = path => `<svg class="nav-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="${path}"/></svg>`;
    const row = (tag, className, role) => {
      const el = document.createElement(tag);
      if (tag === "button") el.type = "button";
      el.className = className;
      el.setAttribute("role", role);
      return el;
    };
    const textSpan = (className, value) => {
      const el = document.createElement("span");
      el.className = className;
      el.textContent = value;
      return el;
    };

    const trigger = row("button", "sidebar-menu-item sidebar-ws-trigger", "menuitem");
    trigger.id = "sidebarWorkspaceItem";
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", "sidebarWorkspaceMenu");
    trigger.title = `${current.name} · ${kindLabel(current).toLowerCase()} workspace`;
    trigger.insertAdjacentHTML("beforeend", icon("M8 2.5 13.5 5.25 8 8 2.5 5.25zM2.5 8 8 10.75 13.5 8M2.5 10.75 8 13.5l5.5-2.75"));
    trigger.append(textSpan("sidebar-ws-name", current.name), textSpan("sidebar-ws-kind", kindTag(current)));
    trigger.insertAdjacentHTML("beforeend", '<svg class="sidebar-menu-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 4.5 10 8l-3.5 3.5"/></svg>');
    const rule = document.createElement("hr");
    rule.className = "sidebar-menu-rule";
    accountMenu.querySelector(".sidebar-menu-head").after(trigger, rule);

    const submenu = row("div", "sidebar-menu sidebar-submenu", "menu");
    submenu.id = "sidebarWorkspaceMenu";
    submenu.setAttribute("aria-labelledby", "sidebarWorkspaceItem");
    submenu.hidden = true;
    submenu.insertAdjacentHTML("beforeend", '<div class="sidebar-menu-head"><span class="sidebar-menu-name">Workspaces</span></div>');
    for (const workspace of workspaces) {
      const item = row("button", "sidebar-menu-item sidebar-ws-option", "menuitemradio");
      item.setAttribute("aria-checked", String(workspace.id === current.id));
      item.insertAdjacentHTML("beforeend", '<svg class="nav-icon sidebar-ws-check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5"/></svg>');
      item.append(textSpan("sidebar-ws-name", workspace.name), textSpan("sidebar-ws-kind", kindTag(workspace)));
      item.addEventListener("click", () => {
        if (workspace.id === workspaceHeaderId()) return;
        if (document.querySelector(".workspace-page") && !window.confirm("Switch workspace? Unsaved document edits may be lost.")) return;
        setWorkspaceId(workspace.id);
        // Release pages reload in place so the conversation reopens for the chosen workspace.
        location.href = document.body.dataset.releasePage ? location.pathname : "projects.html";
      });
      submenu.append(item);
    }
    submenu.insertAdjacentHTML("beforeend", '<hr class="sidebar-menu-rule">');

    if (desktopMode) {
      const identity = await apiFetch(`${resolvedApiBase}/me`).then(r => r.ok ? r.json() : null).catch(() => null);
      if (identity?.display_name) {
        const currentRole = current.role || "member";
        const identityLine = document.createElement("div");
        identityLine.className = "sidebar-menu-head";
        identityLine.textContent = `${identity.display_name} · ${currentRole}`;
        accountMenu.append(identityLine);
      }
      const signOut = row("button", "sidebar-menu-item", "menuitem");
      signOut.innerHTML = `${icon("M6.5 3.5h-3v9h3M8 5.5 11 8l-3 2.5M11 8H5")}<span>Switch account / sign out</span>`;
      signOut.addEventListener("click", async () => {
        try { await apiFetch(`${resolvedApiBase}/auth/local/logout`, { method: "POST" }); } catch { /* Local token is cleared regardless. */ }
        try { sessionStorage.removeItem("semred.local-session"); } catch { /* Best effort. */ }
        location.href = "signin.html";
      });
      accountMenu.append(signOut);
    }

    const createOrg = row("button", "sidebar-menu-item", "menuitem");
    createOrg.innerHTML = `${icon("M8 3.5v9M3.5 8h9")}<span>New organization workspace</span>`;
    createOrg.addEventListener("click", () => openCreateWorkspace(workspaces));
    submenu.append(createOrg);

    if (current.kind === "organization" && current.role === "owner") {
      const manage = row("button", "sidebar-menu-item", "menuitem");
      manage.innerHTML = `${icon("M6 7.25a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM2.5 12.5c.6-1.9 1.9-2.9 3.5-2.9s2.9 1 3.5 2.9M10.5 4a1.8 1.8 0 0 1 0 3.4M11.5 9.8c1 .4 1.6 1.3 2 2.7")}<span>Manage members</span>`;
      manage.addEventListener("click", () => openWorkspaceMembers(current));
      submenu.append(manage);
    }

    document.body.append(submenu);
    accountMenu.dataset.workspaces = "ready";
    document.dispatchEvent(new CustomEvent("semred:workspace-menu"));
  }

  // Native WebKit does not reliably present window.prompt()/alert() from a
  // packaged Tauri window. Keep member administration in an accessible,
  // in-page dialog and send every change through the existing owner-checked API.
  function openWorkspaceMembers(workspace) {
    const dialog = document.createElement("dialog");
    dialog.className = "ws-dialog ws-members-dialog";
    dialog.setAttribute("aria-labelledby", "wsMembersTitle");
    dialog.innerHTML = `
      <div class="ws-dialog-card">
        <div class="ws-dialog-head"><span class="ws-dialog-mark" aria-hidden="true">♧</span><button type="button" class="ws-dialog-x" aria-label="Close" data-close><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg></button></div>
        <h2 id="wsMembersTitle">Manage workspace members</h2>
        <p class="ws-dialog-lead">${escapeText(workspace.name)} · add a local account, assign its workspace role, or remove access. Role changes are checked by the server.</p>
        <form class="ws-member-form">
          <label class="ws-field"><span class="ws-field-label">Account ID</span><span class="ws-field-box"><input name="user_id" type="text" inputmode="text" autocomplete="off" spellcheck="false" placeholder="64-character account ID" required pattern="[0-9a-f]{64}" maxlength="64"></span></label>
          <label class="ws-field"><span class="ws-field-label">Workspace role</span><select name="role"><option value="viewer">Viewer · read access</option><option value="editor">Editor · prepare and review</option><option value="approver">Approver · authorize releases</option></select></label>
          <div class="ws-dialog-actions"><button type="submit" class="btn-primary">Add member and assign role</button></div>
        </form>
        <p class="ws-hint" role="status" aria-live="polite"></p>
        <div class="ws-member-list" aria-label="Current workspace members"></div>
      </div>`;
    document.body.append(dialog);
    const path = `${resolvedApiBase}/workspaces/${encodeURIComponent(workspace.id)}/members`;
    const hint = dialog.querySelector(".ws-hint");
    const list = dialog.querySelector(".ws-member-list");
    const form = dialog.querySelector(".ws-member-form");
    let busy = false;
    const status = (text, tone = "") => { hint.textContent = text; hint.dataset.tone = tone; };
    const request = async (url, options = {}) => {
      const response = await apiFetch(url, options);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Workspace member update failed.");
      return body;
    };
    async function loadMembers() {
      list.replaceChildren();
      try {
        const members = await request(path);
        for (const member of members) {
          const rowEl = document.createElement("div");
          rowEl.className = "ws-member-row";
          const identity = document.createElement("code");
          identity.textContent = `${member.role} · ${member.user_id}`;
          rowEl.append(identity);
          if (member.role !== "owner") {
            const remove = document.createElement("button");
            remove.type = "button"; remove.className = "btn"; remove.textContent = "Remove";
            remove.addEventListener("click", async () => {
              if (busy) return;
              busy = true; remove.disabled = true;
              try { await request(`${path}/${encodeURIComponent(member.user_id)}`, { method: "DELETE" }); status("Member access removed.", "ok"); await loadMembers(); }
              catch (error) { status(error.message, "error"); remove.disabled = false; }
              finally { busy = false; }
            });
            rowEl.append(remove);
          }
          list.append(rowEl);
        }
        if (!members.length) list.textContent = "No members yet.";
      } catch (error) { status(error.message, "error"); }
    }
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (busy || !form.reportValidity()) return;
      const userId = form.elements.user_id.value.trim();
      const role = form.elements.role.value;
      busy = true;
      form.querySelector('button[type="submit"]').disabled = true;
      try {
        await request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: userId }) });
        await request(`${resolvedApiBase}/api/releases/members/role`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: userId, role }) });
        status("Member added and role assigned.", "ok");
        form.reset();
        await loadMembers();
      } catch (error) { status(error.message, "error"); }
      finally { busy = false; form.querySelector('button[type="submit"]').disabled = false; }
    });
    dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.addEventListener("cancel", event => { event.preventDefault(); dialog.close(); });
    dialog.showModal();
    loadMembers();
    form.elements.user_id.focus();
  }

  function escapeText(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  }

  window.Semred = Object.freeze({
    get apiBase() { return resolvedApiBase; },
    apiFetch,
    workspacesReady: workspaceLoadPromise,
    get workspaceId() { return workspaceHeaderId(); },
    setTheme,
    get theme() { return resolve(preference); },
    get themePreference() { return preference; },
  });

  // Keep the existing class-based open/close handlers; add shared keyboard behavior.
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-theme-switch]").forEach(buildSwitch);
    buildWorkspaceControls();
    document.querySelectorAll(".sidebar-link.active").forEach(link => {
      link.setAttribute("aria-current", "page");
    });
    const focusable = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    document.querySelectorAll(".modal").forEach(modal => {
      const panel = modal.querySelector(".modal-content");
      const title = panel?.querySelector("h2, h3");
      if (!panel) return;
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      panel.tabIndex = -1;
      if (title) {
        title.id ||= `${modal.id}-title`;
        modal.setAttribute("aria-labelledby", title.id);
      }

      let wasOpen = false;
      let returnFocus = null;
      const controls = () => [...panel.querySelectorAll(focusable)].filter(el => el.getClientRects().length);
      new MutationObserver(() => {
        const isOpen = !modal.classList.contains("hidden");
        if (isOpen === wasOpen) return;
        wasOpen = isOpen;
        if (isOpen) {
          returnFocus = document.activeElement;
          (controls()[0] || panel).focus();
        } else if (returnFocus?.isConnected) {
          returnFocus.focus();
        }
      }).observe(modal, { attributes: true, attributeFilter: ["class"] });

      modal.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          event.preventDefault();
          // Use existing cancel handlers so their document-specific cleanup still runs.
          const cancel = panel.querySelector('[id*="cancel" i], [id*="close" i], .modal-close');
          if (cancel) cancel.click();
          else modal.classList.add("hidden");
        } else if (event.key === "Tab") {
          const items = controls();
          const first = items[0] || panel;
          const last = items.at(-1) || panel;
          if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
            event.preventDefault();
            first.focus();
          }
        }
      });
    });
  });
})();
