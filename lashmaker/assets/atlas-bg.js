/* atlas-bg.js — used by index.html (and the index-atlas.html review copy)
 * Silk WebGL background fixed behind the whole page, alternating open/panel
 * section depth, and the portfolio grid turned into an autonomous orbit.
 * Runs after assets/site.js (defer order) so #portfolioGrid is already populated.
 * Backup of the pre-atlas index.html: _backup/index-pre-atlas-2026-09-02.html
 */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function isLight() {
    return document.documentElement.getAttribute('data-theme') === 'light';
  }

  /* ---------- 1. classify sections as "open" (silk shows) or "panel" (opaque, covers silk) ---------- */
  // quiz is "open" on purpose — it breaks the run of opaque panels (services -> curls -> ...)
  // and lets the silk breathe again for a beat; its own card provides the readable surface.
  var OPEN_IDS = ['top', 'portfolio', 'quiz', 'care', 'reviews', 'contacts'];
  var PANEL_IDS = ['services', 'curls', 'tryon', 'booking'];
  OPEN_IDS.forEach(function (id) { var el = document.getElementById(id); if (el) el.classList.add('atlas-open'); });
  PANEL_IDS.forEach(function (id) { var el = document.getElementById(id); if (el) el.classList.add('atlas-panel'); });

  /* ---------- 2. silk shader, fixed behind the page, gated on theme ---------- */
  var cv = document.getElementById('atlasBg');
  var fb = document.querySelector('.atlas-fallback');
  var shaderOK = false, gl, uR, uT, uM, uL;
  var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  var mouse = [0.5, 0.5], target = [0.5, 0.5], startT = performance.now(), sraf = 0, sAlive = false;

  function initShader() {
    if (reduce || !cv) return false;
    gl = cv.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) return false;
    var VERT = '#version 300 es\n' +
      'const vec2 v[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));\n' +
      'void main(){gl_Position=vec4(v[gl_VertexID],0.,1.);}';
    var FRAG = '#version 300 es\n' +
      'precision highp float;\n' +
      'out vec4 O; uniform vec2 R; uniform float T; uniform vec2 M; uniform float L;\n' +
      'void main(){\n' +
      '  vec2 uv=gl_FragCoord.xy/R.xy;\n' +
      '  vec2 p=(uv-0.5); p.x*=R.x/R.y; p*=3.2;\n' +
      '  p+=(M-0.5)*0.5;\n' +
      // light theme: squash x / stretch y so the folds read as a tall vertical drape, not blobs
      '  p=mix(p, vec2(p.x*1.22, p.y*0.70), L);\n' +
      '  vec2 q=p; float f=0.0;\n' +
      '  for(int i=0;i<4;i++){\n' +
      '    float fi=float(i);\n' +
      '    q+=0.55*vec2(sin(q.y*1.7+T*0.28+fi), cos(q.x*1.6-T*0.22-fi));\n' +
      '    f+=abs(sin(q.x*1.15)*sin(q.y*1.15));\n' +
      '  }\n' +
      '  f/=4.0;\n' +
      '  float ridge=f*8.0+T*0.15;\n' +
      '  float lines=pow(1.0-abs(sin(ridge)),7.0);\n' +
      '  float soft=pow(1.0-abs(sin(ridge)),1.7);\n' +
      '  float sheen=pow(1.0-abs(sin(ridge)),16.0);\n' +
      // woven grain: fine diagonal threads, only meaningful in light, kept tiny to avoid moire
      '  float weave=sin((p.x-p.y)*26.0)*sin((p.x+p.y)*24.0+1.7);\n' +
      '  float haze=smoothstep(1.1,0.0,length(p*0.42));\n' +
      '  vec3 gold=vec3(0.79,0.635,0.29);\n' +
      '  vec3 base=mix(vec3(0.043,0.030,0.023), vec3(0.957,0.920,0.848), L);\n' +
      '  vec3 col=base;\n' +
      // haze: warm bloom in dark; a faint deepening in light so the centre still reads as fabric
      '  col+=mix(gold, vec3(-0.04,-0.045,-0.05), L)*(haze*0.14);\n' +
      // broad satin sweeps — light only (dark contribution is zero): warm taupe shadow gathers
      '  col+=mix(vec3(0.0), vec3(-0.150,-0.156,-0.166), L)*soft;\n' +
      // satin fold lines: gold light picked out on black; deeper warm-brown crease in cream
      '  col+=mix(gold*0.85, vec3(-0.230,-0.240,-0.262), L)*lines;\n' +
      // broad crest tone: bright specular in dark; a soft warm sheen in light
      '  col+=mix(vec3(1.0,0.97,0.89)*0.4, vec3(0.10,0.086,0.062), L)*pow(lines,3.0);\n' +
      // tight satin sheen line catching the light along each fold ridge (light only)
      '  col+=mix(vec3(0.0), vec3(0.20,0.185,0.155), L)*sheen;\n' +
      // thread grain (light only)
      '  col+=mix(vec3(0.0), vec3(0.014,0.013,0.011), L)*weave;\n' +
      '  float vig=smoothstep(1.5,0.2,length(uv-0.5));\n' +
      '  col*=mix( mix(0.6,1.0,vig), mix(0.86,1.03,vig), L );\n' +
      '  O=vec4(clamp(col,0.0,1.0),1.0);\n' +
      '}';
    function sh(t, s) {
      var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(o)); return null; }
      return o;
    }
    var vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    uR = gl.getUniformLocation(prog, 'R');
    uT = gl.getUniformLocation(prog, 'T');
    uM = gl.getUniformLocation(prog, 'M');
    uL = gl.getUniformLocation(prog, 'L');
    return true;
  }

  function resize() {
    if (!shaderOK) return;
    cv.width = Math.max(1, window.innerWidth * dpr | 0);
    cv.height = Math.max(1, window.innerHeight * dpr | 0);
    gl.viewport(0, 0, cv.width, cv.height);
  }
  function drawShader() {
    sraf = 0;
    if (!sAlive) return;
    var t = (performance.now() - startT) / 1000;
    mouse[0] += (target[0] - mouse[0]) * 0.035;
    mouse[1] += (target[1] - mouse[1]) * 0.035;
    gl.uniform2f(uR, cv.width, cv.height);
    gl.uniform1f(uT, t);
    gl.uniform2f(uM, mouse[0], mouse[1]);
    gl.uniform1f(uL, isLight() ? 1.0 : 0.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    sraf = requestAnimationFrame(drawShader);
  }
  function startShader() { if (shaderOK && !sAlive) { sAlive = true; if (!sraf) sraf = requestAnimationFrame(drawShader); } }
  function stopShader() { sAlive = false; if (sraf) { cancelAnimationFrame(sraf); sraf = 0; } }

  shaderOK = initShader();
  if (shaderOK) {
    resize();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', function (e) {
      target[0] = e.clientX / window.innerWidth; target[1] = 1 - e.clientY / window.innerHeight;
    }, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopShader(); else startShader();
    });
    startShader();
  } else {
    if (cv) cv.style.display = 'none';
    if (fb) fb.hidden = false;
  }
  // theme toggle flips data-theme on <html> (see assets/site.js) — the shader now renders
  // both palettes (uniform L, set per frame), so we just keep it alive across the switch
  new MutationObserver(function () {
    if (shaderOK) startShader();
    else if (fb) fb.hidden = false;
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* ---------- 3. parallax drift on open-section content (mid depth plane) ---------- */
  if (!reduce) {
    var openInners = [].slice.call(document.querySelectorAll('.atlas-open > .container'));
    var pTick = false;
    function parallax() {
      pTick = false;
      var vh = window.innerHeight;
      for (var i = 0; i < openInners.length; i++) {
        var el = openInners[i], r = el.getBoundingClientRect();
        var c = (r.top + r.height / 2 - vh / 2) / vh;
        el.style.transform = 'translateY(' + (c * -26).toFixed(1) + 'px)';
      }
    }
    window.addEventListener('scroll', function () { if (!pTick) { pTick = true; requestAnimationFrame(parallax); } }, { passive: true });
    window.addEventListener('resize', parallax, { passive: true });
    parallax();
  }

  /* ---------- 4. portfolio grid -> autonomous orbit, hover to pause + read ---------- */
  var grid = document.getElementById('portfolioGrid');
  var portfolioSection = document.getElementById('portfolio');
  if (grid && portfolioSection && grid.children.length) {
    grid.classList.add('atlas-orbit');
    if (!reduce) initOrbit(grid, portfolioSection);
  }

  function initOrbit(stage, section) {
    var cards = [].slice.call(stage.querySelectorAll('.photo-card'));
    var N = cards.length;
    if (!N) return;
    var TAU = Math.PI * 2;
    var W = 0, Hh = 0, cx = 0, cy = 0, rx = 0, ry = 0;
    var angle = 0, SPEED = TAU / 60, paused = false, hotIdx = -1;
    var lastT = performance.now(), raf = 0, onScreen = true;
    var lastFilt = [];
    // below 720px the autonomous orbit hands off entirely to the swipe carousel
    // (initMobileCarousel, set up at the bottom of this function)
    var mobileMQ = matchMedia('(max-width:720px)');
    function isMobile() { return mobileMQ.matches; }

    function measure() {
      var r = stage.getBoundingClientRect();
      W = r.width; Hh = r.height; cx = W / 2; cy = Hh * 0.5;
      // flatter ellipse + tighter radii = a calm coverflow sweep, not a vertical pile-up
      rx = Math.min(W * 0.30, N <= 5 ? 330 : 460);
      ry = Math.min(Hh * 0.24, 132);
    }

    function render() {
      if (isMobile()) return; // layout + depth are owned by CSS + mobileRender() below
      var someHot = hotIdx >= 0;
      for (var i = 0; i < N; i++) {
        var card = cards[i];
        var a = (i / N) * TAU + angle;
        var s = Math.sin(a), dz = (s + 1) / 2;
        var cw = card.offsetWidth || 200, ch = card.offsetHeight || 280;
        var x = cx + rx * Math.cos(a), y = cy + ry * s;
        var scale, opacity, filt, bank, z;
        // No animated blur anywhere — per-frame filter:blur() on big compositor layers
        // is what made the carousel stutter. Depth now reads via scale + brightness + opacity.
        if (i === hotIdx) {
          scale = 1.28; opacity = 1; filt = 'none'; bank = 0; z = 999; y -= 8;
        } else if (someHot) {
          scale = 0.64 + dz * 0.28; opacity = 0.9; filt = 'brightness(0.3)'; bank = Math.cos(a) * 4; z = Math.round(dz * 60);
        } else {
          // dz: 0 at the back of the orbit, 1 at the front. Steep falloff so only the
          // frontmost card or two stay lit; the rest sink into shadow even without hover.
          var d = Math.pow(dz, 1.7);
          scale = 0.64 + dz * 0.30; opacity = 0.34 + d * 0.66;
          filt = 'brightness(' + (0.4 + d * 0.6).toFixed(3) + ')';
          bank = Math.cos(a) * 4; z = Math.round(dz * 100);
        }
        card.style.transform =
          'translate3d(' + (x - cw / 2).toFixed(1) + 'px,' + (y - ch / 2).toFixed(1) + 'px,0)' +
          ' rotate(' + bank.toFixed(2) + 'deg) scale(' + scale.toFixed(3) + ')';
        card.style.opacity = opacity.toFixed(3);
        if (lastFilt[i] !== filt) { card.style.filter = filt; lastFilt[i] = filt; }
        card.style.zIndex = z;
      }
    }

    function loop(now) {
      raf = 0;
      if (isMobile()) return; // no autoplay on a phone — the finger sets the pace
      var dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      angle = (angle + SPEED * dt) % TAU;
      render();
      if (onScreen && !paused) raf = requestAnimationFrame(loop);
    }
    function kick() { if (!isMobile() && !raf && onScreen && !paused) { lastT = performance.now(); raf = requestAnimationFrame(loop); } }

    function setHot(i) {
      if (i === hotIdx) return;
      if (hotIdx >= 0 && cards[hotIdx]) cards[hotIdx].classList.remove('is-hot');
      hotIdx = i;
      if (i >= 0) { cards[i].classList.add('is-hot'); stage.classList.add('is-paused'); }
      else stage.classList.remove('is-paused');
    }
    function cardAt(px, py) {
      var el = document.elementFromPoint(px, py);
      while (el && el !== stage && !(el.classList && el.classList.contains('photo-card'))) el = el.parentElement;
      return (el && el.classList && el.classList.contains('photo-card')) ? cards.indexOf(el) : -1;
    }

    var moveRaf = 0, pX = 0, pY = 0;
    stage.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      pX = e.clientX; pY = e.clientY;
      if (moveRaf) return;
      moveRaf = requestAnimationFrame(function () {
        moveRaf = 0;
        var idx = cardAt(pX, pY);
        if (idx < 0) return;
        if (!paused) { paused = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
        if (idx !== hotIdx) { setHot(idx); render(); }
      });
    });
    stage.addEventListener('pointerleave', function () { paused = false; setHot(-1); render(); kick(); });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        onScreen = en[0].isIntersecting;
        if (!onScreen && raf) { cancelAnimationFrame(raf); raf = 0; }
        kick();
      }, { threshold: 0.02 }).observe(section);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; } else kick();
    });

    /* ---------- mobile: swipe carousel on native scroll-snap ---------- */
    // Same read as the desktop orbit — the card nearest the centre is bright and sharp,
    // the rest recede — but driven by the user's own swipe via scroll position, not a
    // rAF spin. Native scroll does the heavy lifting so this stays smooth on any phone.
    var mTick = false;
    function mobileRender() {
      mTick = false;
      if (!isMobile()) {
        // just left mobile layout — drop the inline styles mobileRender set so the
        // desktop orbit's own render() (transform/opacity/filter) takes over cleanly
        for (var j = 0; j < N; j++) {
          cards[j].style.opacity = ''; cards[j].style.filter = ''; cards[j].style.transform = '';
        }
        return;
      }
      var stageRect = stage.getBoundingClientRect();
      if (!stageRect.width) return;
      var centerX = stageRect.left + stageRect.width / 2;
      for (var i = 0; i < N; i++) {
        var card = cards[i];
        var r = card.getBoundingClientRect();
        var dist = Math.min(Math.abs((r.left + r.width / 2) - centerX) / (stageRect.width / 2), 1);
        var close = Math.pow(1 - dist, 1.6);
        card.style.opacity = (0.4 + close * 0.6).toFixed(3);
        card.style.filter = 'brightness(' + (0.5 + close * 0.5).toFixed(3) + ')';
        card.style.transform = 'scale(' + (0.86 + close * 0.14).toFixed(3) + ')';
      }
    }
    function onMobileScroll() { if (!mTick) { mTick = true; requestAnimationFrame(mobileRender); } }
    stage.addEventListener('scroll', onMobileScroll, { passive: true });

    function onLayoutChange() { measure(); mobileRender(); render(); kick(); }
    window.addEventListener('resize', onLayoutChange, { passive: true });
    if (mobileMQ.addEventListener) mobileMQ.addEventListener('change', onLayoutChange);
    else if (mobileMQ.addListener) mobileMQ.addListener(onLayoutChange); // older Safari

    measure(); mobileRender(); render();
    // images loading in can shift card widths after this first pass — true up once more
    setTimeout(mobileRender, 350);
    raf = requestAnimationFrame(loop);
  }
})();
