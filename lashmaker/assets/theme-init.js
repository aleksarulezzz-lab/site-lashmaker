/* Runs before first paint: apply the saved theme, or fall back to the
   visitor's OS preference. Dark is the default when neither says "light". */
(function () {
  try {
    var t = localStorage.getItem('lashSiteTheme');
    if (!t && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      t = 'light';
    }
    if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
  } catch (e) {}
})();
