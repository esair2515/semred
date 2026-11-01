/* A disclosure, not a modal: links stay available if JavaScript is unavailable. */
(() => {
  const header = document.querySelector('.nav');
  const toggle = header?.querySelector('.nav-toggle');
  if (!toggle) return;

  const compact = window.matchMedia('(max-width: 1080px)');
  const cta = header.querySelector('.nav-cta');
  const desktopActions = header.querySelector('.nav-right');
  const placeCta = () => {
    // Keep the keyboard order aligned with the compact header's visual order.
    if (compact.matches) toggle.before(cta);
    else desktopActions.append(cta);
  };
  const setOpen = open => {
    header.dataset.navOpen = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  };
  setOpen(false);
  placeCta();
  header.dataset.navReady = 'true';

  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  header.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });
  header.addEventListener('click', event => {
    if (compact.matches && event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('click', event => {
    if (!header.contains(event.target)) setOpen(false);
  });
  compact.addEventListener('change', () => {
    // Move focus out of controls that are about to become hidden on resize.
    const active = document.activeElement;
    placeCta();
    if (active === cta) cta.focus();
    if (compact.matches && active?.closest('#primaryNav, #navTheme, #navSignIn')) toggle.focus();
    if (!compact.matches && active === toggle) header.querySelector('.nav-links a').focus();
    setOpen(false);
  });
})();
