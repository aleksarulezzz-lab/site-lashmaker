(function(){
  var ENDPOINT = 'https://lashmaker-booking.alekssandra86.workers.dev/api/track';

  var viewId;
  try {
    viewId = (self.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : (Date.now().toString(36) + Math.random().toString(36).slice(2));
  } catch (e) {
    viewId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  var start = Date.now();
  var dwellSent = false;

  // Where this visit came from: ?utm_source=… wins, else the referring host,
  // else "direct". Computed here so the server just needs GROUP BY.
  function trafficSource() {
    try {
      var utm = new URLSearchParams(location.search).get('utm_source');
      if (utm) return utm.slice(0, 60);
      if (document.referrer) {
        var h = new URL(document.referrer).hostname.replace(/^www\./, '');
        if (h && h !== location.hostname) return h.slice(0, 60);
      }
    } catch (e) {}
    return 'direct';
  }

  function send(payload) {
    try {
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      } else if (window.fetch) {
        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          keepalive: true
        }).catch(function(){});
      }
    } catch (e) {}
  }

  // Pageview on load.
  send({ path: location.pathname, viewId: viewId, source: trafficSource() });

  // Follow-up beacon with time-on-page. Sent the first time the page is hidden
  // (tab switch or navigation away) — best-effort: some mobile browsers kill the
  // tab before this fires, so the server-side average is an approximation.
  function sendDwell() {
    if (dwellSent) return;
    dwellSent = true;
    send({ path: location.pathname, viewId: viewId, dwellMs: Date.now() - start });
  }

  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState === 'hidden') sendDwell();
  });
  window.addEventListener('pagehide', sendDwell);
})();
