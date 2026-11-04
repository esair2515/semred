(() => {
  // This is a convenience gate for a small beta, not security. GitHub Pages
  // serves all client-side code publicly; do not use real secrets here.
  const ACCESS_CODE = "091508";
  const path = window.location.pathname;
  const siteRootMatch = path.match(/^(.*\/)(?:access|download)(?:\/|$)/);
  const siteRoot = siteRootMatch ? siteRootMatch[1] : path.slice(0, path.lastIndexOf("/") + 1);
  const sessionKey = "semred-beta-access:" + siteRoot;
  const isAccessPage = /\/access(?:\/|$)/.test(path);
  const isDownloadPage = /\/download(?:\/|$)/.test(path);

  const hasAccess = () => {
    try {
      return window.sessionStorage.getItem(sessionKey) === "granted";
    } catch {
      return false;
    }
  };

  if (isDownloadPage && !hasAccess()) {
    window.location.replace(siteRoot + "access/");
    return;
  }
  if (isAccessPage && hasAccess()) {
    window.location.replace(siteRoot + "download/");
    return;
  }
  if (!isAccessPage) return;

  const bindForm = () => {
    const form = document.getElementById("accessCodeForm");
    if (!form) return;
    const input = form.elements.namedItem("accessCode");
    const status = document.getElementById("accessError");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      // Keep this as a string. Converting to Number would drop leading zeroes.
      const enteredCode = String(input.value);
      if (enteredCode !== ACCESS_CODE) {
        status.textContent = "That code didn’t work. Check it and try again.";
        input.setAttribute("aria-invalid", "true");
        input.focus();
        return;
      }
      try {
        window.sessionStorage.setItem(sessionKey, "granted");
      } catch {
        status.textContent = "This browser cannot keep the access session. Enable session storage and try again.";
        return;
      }
      window.location.replace(siteRoot + "download/");
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindForm, { once: true });
  } else {
    bindForm();
  }
})();
