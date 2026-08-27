(function(){
  var WORKER_BASE_URL = 'https://lashmaker-booking.alekssandra86.workers.dev';
  try {
    var payload = JSON.stringify({ path: location.pathname });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(WORKER_BASE_URL + '/api/track', new Blob([payload], { type: 'application/json' }));
    } else if (window.fetch) {
      fetch(WORKER_BASE_URL + '/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(function(){});
    }
  } catch(e) {}
})();
