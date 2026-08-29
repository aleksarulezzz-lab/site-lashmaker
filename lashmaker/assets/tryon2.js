/* Виртуальная примерочная — ТЕСТОВАЯ версия.
   Другой способ наложения: заранее нарисованная "накладка" ресниц (в чистом прямом
   пространстве, где форма контролируется точно) изгибается по линии верхнего века.
   Фото обрабатывается только в браузере клиентки и никуда не отправляется. */
(function(){

var STYLE_DATA = {
  classic:    { key:'classic',    label:'Классика',      hint:'Естественный эффект, 1 к 1' },
  hybrid:     { key:'hybrid',     label:'Гибрид',         hint:'Текстура без театральности' },
  volume2d3d: { key:'volume2d3d', label:'Объём 2D–3D',    hint:'Заметный, воздушный объём' },
  volume5d:   { key:'volume5d',   label:'Объём 5D+',      hint:'Пышные плотные пучки' },
  mega:       { key:'mega',       label:'Мега объём',     hint:'Максимальная густота и драма' }
};
var STYLE_ORDER = ['classic','hybrid','volume2d3d','volume5d','mega'];

/* параметры "накладки" для каждого объёма. Все размеры — доли ВЫСОТЫ спрайта (spriteH),
   которая равна длине ресниц на лице × коэффициент; так после изгиба ничего не «мажется».
   band* — сплошная база накладки (силуэт), tip* — отдельные кончики поверх неё. */
var STYLE_SPRITE = {
  classic:    { bandAlpha:0.40, bandFrac:0.30, tipRoots:46,  tipWidthF:0.055, tipSpreadF:0.05, tipJitterF:0.025, lineF:0.075 },
  hybrid:     { bandAlpha:0.55, bandFrac:0.40, tipRoots:64,  tipWidthF:0.050, tipSpreadF:0.06, tipJitterF:0.025, lineF:0.090 },
  volume2d3d: { bandAlpha:0.70, bandFrac:0.50, tipRoots:88,  tipWidthF:0.046, tipSpreadF:0.06, tipJitterF:0.030, lineF:0.105 },
  volume5d:   { bandAlpha:0.82, bandFrac:0.60, tipRoots:116, tipWidthF:0.042, tipSpreadF:0.07, tipJitterF:0.030, lineF:0.120 },
  mega:       { bandAlpha:0.92, bandFrac:0.70, tipRoots:154, tipWidthF:0.038, tipSpreadF:0.07, tipJitterF:0.035, lineF:0.140 }
};

var CURL_ORDER = ['b','c','cc','d'];
var CURL_LABEL = { b:'B', c:'C', cc:'CC', d:'D' };
var CURL_AMT   = { b:0.10, c:0.22, cc:0.34, d:0.48 };  /* доля длины, на которую кончик уходит к внешнему уголку */

var SERVICE_MAP = {
  classic:'Классическое наращивание',
  hybrid:'2D объём',
  volume2d3d:'3D–5D объём',
  volume5d:'3D–5D объём',
  mega:'Мега объём'
};

var LASH_SCALE = 0.52;   /* длина ресниц (при максимуме карты длин) как доля ширины глаза */
var SEAT = 0.05;         /* насколько посадить накладку ниже линии век (доля длины ресниц) */

var MEDIAPIPE_VERSION = '0.10.14';
var MEDIAPIPE_PKG = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MEDIAPIPE_VERSION;
var MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

var EYE_DEFS = [
  { upper:[33,246,161,160,159,158,157,173], lower:[7,163,144,145,153,154,155], outer:33,  inner:133 },
  { upper:[263,466,388,387,386,385,384,398], lower:[249,390,373,374,380,381,382], outer:263, inner:362 }
];

/* ---------- малая векторная геометрия ---------- */
function sub(a,b){return {x:a.x-b.x,y:a.y-b.y};}
function add(a,b){return {x:a.x+b.x,y:a.y+b.y};}
function scl(a,k){return {x:a.x*k,y:a.y*k};}
function len(a){return Math.sqrt(a.x*a.x+a.y*a.y);}
function dist(a,b){return len(sub(a,b));}
function avgPoint(pts){var s={x:0,y:0};pts.forEach(function(p){s.x+=p.x;s.y+=p.y;});return {x:s.x/pts.length,y:s.y/pts.length};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function smoothstep(x){x=clamp(x,0,1);return x*x*(3-2*x);}
function pseudoRand(i){var x=Math.sin(i*12.9898)*43758.5453;return x-Math.floor(x);}
function polylineLength(pts){var t=0;for(var i=1;i<pts.length;i++)t+=dist(pts[i-1],pts[i]);return t;}
function pointAtLength(pts,target){
  var acc=0;
  for(var i=1;i<pts.length;i++){
    var seg=dist(pts[i-1],pts[i]);
    if(acc+seg>=target || i===pts.length-1){
      var t = seg>0 ? (target-acc)/seg : 0;
      return add(pts[i-1], scl(sub(pts[i],pts[i-1]), clamp(t,0,1)));
    }
    acc+=seg;
  }
  return pts[pts.length-1];
}
function chaikin(pts, iters){
  for(var k=0;k<iters;k++){
    var out=[pts[0]];
    for(var i=0;i<pts.length-1;i++){
      var a=pts[i], b=pts[i+1];
      out.push({x:a.x*0.75+b.x*0.25, y:a.y*0.75+b.y*0.25});
      out.push({x:a.x*0.25+b.x*0.75, y:a.y*0.25+b.y*0.75});
    }
    out.push(pts[pts.length-1]);
    pts=out;
  }
  return pts;
}

/* ---------- канонический спрайт "накладки" ---------- */
/* карта длин по ширине накладки: u=0 внешний уголок, u=1 внутренний.
   Самое длинное во внешней трети (u≈0.30), у обоих уголков сходит на нет. */
function lengthAt(u){
  var rampUp = 0.14 + 0.86*smoothstep(u/0.30);
  var taper  = 0.42 + 0.58*smoothstep((1-u)/0.72);
  return Math.min(rampUp, taper);
}

function strokeTaper(g, x0,y0, cx,cy, x1,y1, w, color){
  var N=8, L=[], R=[], prev={x:x0,y:y0};
  for(var i=0;i<=N;i++){
    var t=i/N, mt=1-t;
    var x=mt*mt*x0+2*mt*t*cx+t*t*x1;
    var y=mt*mt*y0+2*mt*t*cy+t*t*y1;
    var dx=x-prev.x, dy=y-prev.y, l=Math.hypot(dx,dy)||1;
    var nx=-dy/l, ny=dx/l;
    var ww=w*(1-t*0.85)+0.15;
    L.push({x:x+nx*ww/2,y:y+ny*ww/2});
    R.push({x:x-nx*ww/2,y:y-ny*ww/2});
    prev={x:x,y:y};
  }
  g.beginPath(); g.moveTo(L[0].x,L[0].y);
  for(i=1;i<L.length;i++) g.lineTo(L[i].x,L[i].y);
  for(i=R.length-1;i>=0;i--) g.lineTo(R[i].x,R[i].y);
  g.closePath(); g.fillStyle=color; g.fill();
}

var spriteCache = {};
function buildLashSprite(styleKey, curlKey, spriteW, spriteH){
  var key = styleKey + '|' + curlKey + '|' + spriteW + 'x' + spriteH;
  if(spriteCache[key]) return spriteCache[key];
  var S = STYLE_SPRITE[styleKey], curlAmt = CURL_AMT[curlKey];
  var U = spriteH;                       /* единица размера = высота спрайта */
  var cv = document.createElement('canvas');
  cv.width = spriteW; cv.height = spriteH;
  var g = cv.getContext('2d');
  var rootY = spriteH - 0.03*U;
  var maxLashPx = spriteH * 0.80;
  var col = 'rgba(16,11,8,0.92)';

  function baseLift(u){ return 0.02*U*Math.sin(u*Math.PI); }
  function lenAtU(u){ return lengthAt(u) * maxLashPx; }
  function curlDXAt(u, L){ return curlAmt * L * (0.55 + 0.45*clamp(u/0.15, 0, 1)); }

  /* 1) сплошной силуэт "накладки": низ по линии роста, верх — рваный край (кончики ресниц).
        Каждый столбец силуэта наклонён по curlDX, поэтому изгиб уже вшит в форму. */
  var steps = Math.max(28, Math.round(spriteW/4));
  g.beginPath();
  g.moveTo(0, rootY - baseLift(0));
  for(var s=0; s<=steps; s++){
    var u = s/steps;
    var x = u*spriteW;
    var L = lenAtU(u);
    var jag = (pseudoRand(s*3.17) - 0.5) * L * 0.18;         /* рваность верхнего края */
    var tx = x - curlDXAt(u, L);
    var ty = rootY - baseLift(u) - L*S.bandFrac - jag;
    g.lineTo(tx, ty);
  }
  g.lineTo(spriteW, rootY - baseLift(1));
  g.closePath();
  g.fillStyle = 'rgba(14,10,7,' + S.bandAlpha + ')';
  g.fill();

  /* 2) линия роста (тёмная база у корней) */
  g.save();
  g.lineCap = 'round';
  g.shadowColor = 'rgba(10,7,5,0.5)';
  g.shadowBlur = S.lineF * U * 1.3;
  g.strokeStyle = 'rgba(12,8,6,0.92)';
  g.lineWidth = S.lineF * U;
  g.beginPath();
  for(var lx=0; lx<=spriteW; lx+=0.03*U){
    var lu = lx/spriteW;
    if(lx===0) g.moveTo(lx, rootY - baseLift(lu)); else g.lineTo(lx, rootY - baseLift(lu));
  }
  g.stroke();
  g.restore();

  /* 3) отдельные кончики поверх силуэта — верхняя половина ресниц, тонкие, чуть врозь */
  for(var r=0; r<S.tipRoots; r++){
    var tu = (r+0.5)/S.tipRoots;
    var tx0 = tu*spriteW;
    var tL = lenAtU(tu);
    if(tL < 0.04*U) continue;
    var j1 = pseudoRand(r*13.1), j2 = pseudoRand(r*7.7 + 3), j3 = pseudoRand(r*4.3 + 9);
    var cdx = curlDXAt(tu, tL);
    var bx = tx0 - cdx*(0.50 + 0.15*j3) + (j2-0.5)*S.tipJitterF*U;
    var by = rootY - baseLift(tu) - tL*(S.bandFrac*0.55);
    var px = tx0 - cdx*(1.02 + 0.12*j1) + (j1-0.5)*S.tipSpreadF*U;
    var py = rootY - baseLift(tu) - tL*(0.98 + 0.14*j1);
    var mx = (bx+px)/2 - cdx*0.06;
    var my = (by+py)/2;
    strokeTaper(g, bx, by, mx, my, px, py, S.tipWidthF*U*(0.8 + 0.45*j2), col);
  }

  spriteCache[key] = cv;
  return cv;
}

/* ---------- изгиб накладки по линии верхнего века ---------- */
function drawLashStripOnEye(ctx, upperPts, lowerCenter, outerPt, innerPt, styleKey, curlKey){
  var lid = chaikin(upperPts.slice(), 2);
  var lidLen = polylineLength(lid);
  if(lidLen < 2) return;
  var eyeSpan = dist(outerPt, innerPt);
  if(eyeSpan < 2) return;
  var lashPx = eyeSpan * LASH_SCALE;
  /* спрайт рисуем крупнее реального глаза (≈×3.3), чтобы после изгиба и сжатия
     ресницы оставались чёткими, а не "мазались" */
  var spriteW = Math.max(160, Math.round(eyeSpan * 3.3));
  var spriteH = Math.max(70, Math.round(lashPx * 3.3));
  var sprite = buildLashSprite(styleKey, curlKey, spriteW, spriteH);
  var hScale = lashPx / spriteH;
  var COLS = Math.max(24, Math.round(spriteW / 4));
  var colW = spriteW / COLS;
  var seatPx = lashPx * SEAT;

  ctx.save();
  for(var i=0;i<COLS;i++){
    var sx0 = i*colW, sx1 = (i+1)*colW;
    var p0 = pointAtLength(lid, (sx0/spriteW)*lidLen);
    var p1 = pointAtLength(lid, (sx1/spriteW)*lidLen);
    var tang = sub(p1, p0);
    var tl = len(tang) || 1;
    var nrm = { x:-tang.y/tl, y:tang.x/tl };
    var mid = { x:(p0.x+p1.x)/2, y:(p0.y+p1.y)/2 };
    if((nrm.x*(mid.x-lowerCenter.x) + nrm.y*(mid.y-lowerCenter.y)) < 0) nrm = { x:-nrm.x, y:-nrm.y };
    /* чуть опускаем накладку на линию роста ресниц */
    p0 = { x:p0.x - nrm.x*seatPx, y:p0.y - nrm.y*seatPx };
    p1 = { x:p1.x - nrm.x*seatPx, y:p1.y - nrm.y*seatPx };
    /* аффинное преобразование: столбец спрайта (X in [sx0,sx1], Y in [0,spriteH]) -> параллелограмм на веке */
    var e1 = { x:(p1.x-p0.x)/(sx1-sx0), y:(p1.y-p0.y)/(sx1-sx0) };
    var e2 = { x:-nrm.x*hScale, y:-nrm.y*hScale };
    var T  = { x:p0.x - e1.x*sx0 - e2.x*spriteH, y:p0.y - e1.y*sx0 - e2.y*spriteH };
    ctx.setTransform(e1.x, e1.y, e2.x, e2.y, T.x, T.y);
    var pad = i < COLS-1 ? 0.9 : 0;
    ctx.drawImage(sprite, sx0, 0, (sx1-sx0)+pad, spriteH, sx0, 0, (sx1-sx0)+pad, spriteH);
  }
  ctx.setTransform(1,0,0,1,0,0);
  ctx.restore();
}

/* ---------- состояние ---------- */
var state = { style:'volume2d3d', curl:'c', mode:'idle', liked:new Set() };
var els = {};
var canvasCtx = null, loadedImage = null, eyeData = null, objectUrl = null;

function $(id){ return document.getElementById(id); }

function setStatus(msg, isError){
  if(!els.status) return;
  els.status.textContent = msg || '';
  els.status.classList.toggle('is-error', !!isError);
  els.status.hidden = !msg;
}

function getFaceLandmarker(){
  if(!window.__lashLandmarkerPromise){
    window.__lashLandmarkerPromise = (async function(){
      var mod = await import(MEDIAPIPE_PKG);
      var files = await mod.FilesetResolver.forVisionTasks(MEDIAPIPE_PKG + '/wasm');
      return await mod.FaceLandmarker.createFromOptions(files, {
        baseOptions:{ modelAssetPath: MODEL_URL, delegate:'CPU' },
        runningMode:'IMAGE',
        numFaces:1
      });
    })();
  }
  return window.__lashLandmarkerPromise;
}

function fitCanvasToImage(img){
  var maxW = 640;
  var w = img.naturalWidth, h = img.naturalHeight;
  if(w > maxW){ h = Math.round(h*maxW/w); w = maxW; }
  els.canvas.width = w;
  els.canvas.height = h;
  canvasCtx = els.canvas.getContext('2d');
}

function renderLashes(){
  if(!canvasCtx || !loadedImage) return;
  canvasCtx.clearRect(0,0,els.canvas.width, els.canvas.height);
  canvasCtx.drawImage(loadedImage, 0, 0, els.canvas.width, els.canvas.height);
  if(!eyeData) return;
  eyeData.forEach(function(eye){
    drawLashStripOnEye(canvasCtx, eye.upperPts, eye.lowerCenter, eye.outerPt, eye.innerPt, state.style, state.curl);
  });
}

function toPx(lm, w, h){ return {x: lm.x*w, y: lm.y*h}; }

function computeEyeData(landmarks, w, h){
  return EYE_DEFS.map(function(def){
    var upperPts = def.upper.map(function(i){ return toPx(landmarks[i], w, h); });
    var lowerPts = def.lower.map(function(i){ return toPx(landmarks[i], w, h); });
    return {
      upperPts: upperPts,
      lowerCenter: avgPoint(lowerPts),
      outerPt: toPx(landmarks[def.outer], w, h),
      innerPt: toPx(landmarks[def.inner], w, h)
    };
  });
}

/* ---------- ручной режим (запасной вариант) ---------- */
var MANUAL_TEMPLATE = {
  upperPts: [{x:6,y:50},{x:26,y:28},{x:50,y:17},{x:78,y:14},{x:106,y:19},{x:128,y:31},{x:144,y:50}],
  lower: {x:75,y:66},
  outer: {x:6,y:50},
  inner: {x:144,y:50}
};
var manualPos = [ {x:30,y:42,scale:1}, {x:66,y:42,scale:1} ];

function buildManualLayer(){
  els.manualLayer.innerHTML = '';
  manualPos.forEach(function(pos, idx){
    var wrap = document.createElement('div');
    wrap.className = 'tryon-manual-eye';
    wrap.style.left = pos.x + '%';
    wrap.style.top = pos.y + '%';
    wrap.innerHTML =
      '<canvas width="150" height="80"></canvas>' +
      '<div class="tryon-manual-controls">' +
        '<button type="button" data-act="minus">−</button>' +
        '<button type="button" data-act="plus">+</button>' +
      '</div>';
    var canvas = wrap.querySelector('canvas');
    canvas.style.transform = idx===1 ? 'scaleX(-1)' : '';
    wrap.querySelector('[data-act="minus"]').addEventListener('click', function(){
      pos.scale = clamp(pos.scale-0.1, 0.5, 2.2); applyManualTransform(wrap, pos, idx);
    });
    wrap.querySelector('[data-act="plus"]').addEventListener('click', function(){
      pos.scale = clamp(pos.scale+0.1, 0.5, 2.2); applyManualTransform(wrap, pos, idx);
    });
    makeDraggable(wrap, pos);
    applyManualTransform(wrap, pos, idx);
    els.manualLayer.appendChild(wrap);
    drawManualEye(canvas);
  });
}

function applyManualTransform(wrap, pos, idx){
  wrap.style.left = pos.x + '%';
  wrap.style.top = pos.y + '%';
  wrap.style.transform = 'translate(-50%,-50%) scale(' + pos.scale + ')' + (idx===1 ? ' scaleX(-1)' : '');
}

function drawManualEye(canvas){
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  var t = MANUAL_TEMPLATE;
  drawLashStripOnEye(ctx, t.upperPts, t.lower, t.outer, t.inner, state.style, state.curl);
}

function renderManualLashes(){
  if(!els.manualLayer) return;
  els.manualLayer.querySelectorAll('canvas').forEach(function(c){ drawManualEye(c); });
}

function makeDraggable(wrap, pos){
  var dragging = false, startX, startY, startPos;
  wrap.addEventListener('pointerdown', function(e){
    if(e.target.closest('.tryon-manual-controls')) return;
    dragging = true; startX = e.clientX; startY = e.clientY; startPos = {x:pos.x, y:pos.y};
    wrap.setPointerCapture(e.pointerId);
  });
  wrap.addEventListener('pointermove', function(e){
    if(!dragging) return;
    var rect = els.manualLayer.getBoundingClientRect();
    pos.x = clamp(startPos.x + (e.clientX-startX)/rect.width*100, 0, 100);
    pos.y = clamp(startPos.y + (e.clientY-startY)/rect.height*100, 0, 100);
    wrap.style.left = pos.x + '%';
    wrap.style.top = pos.y + '%';
  });
  wrap.addEventListener('pointerup', function(){ dragging = false; });
  wrap.addEventListener('pointercancel', function(){ dragging = false; });
}

function enterManualMode(msg){
  state.mode = 'manual';
  setStatus(msg || 'Не удалось точно распознать глаза — расположите ресницы вручную: потяните, чтобы подвинуть, «+/−», чтобы изменить размер.', true);
  els.manualLayer.hidden = false;
  buildManualLayer();
}

/* ---------- загрузка фото и распознавание ---------- */
function handleFile(file){
  if(!file || !/^image\//.test(file.type)) return;
  if(objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  var img = new Image();
  img.onload = async function(){
    loadedImage = img;
    eyeData = null;
    els.dropzone.hidden = true;
    els.canvasWrap.hidden = false;
    els.manualLayer.hidden = true;
    els.manualLayer.innerHTML = '';
    fitCanvasToImage(img);
    canvasCtx.drawImage(img, 0, 0, els.canvas.width, els.canvas.height);
    setStatus('Загружаю модуль распознавания лица…');
    try{
      var landmarker = await getFaceLandmarker();
      setStatus('Ищу глаза на фото…');
      var result = landmarker.detect(img);
      if(!result.faceLandmarks || !result.faceLandmarks.length){
        enterManualMode();
        return;
      }
      eyeData = computeEyeData(result.faceLandmarks[0], els.canvas.width, els.canvas.height);
      state.mode = 'auto';
      setStatus('');
      renderLashes();
    }catch(err){
      enterManualMode('Не получилось загрузить распознавание лица (нет соединения или браузер не поддерживает) — расположите ресницы вручную.');
    }
  };
  img.onerror = function(){ setStatus('Не получилось открыть это фото, попробуйте другое.', true); };
  img.src = objectUrl;
}

function resetTryOn(){
  loadedImage = null; eyeData = null; state.mode = 'idle';
  els.dropzone.hidden = false;
  els.canvasWrap.hidden = true;
  els.manualLayer.hidden = true;
  els.manualLayer.innerHTML = '';
  els.file.value = '';
  setStatus('');
}

/* ---------- UI ---------- */
function buildOptionButtons(){
  els.styles.innerHTML = STYLE_ORDER.map(function(k){
    var s = STYLE_DATA[k];
    return '<button type="button" class="tryon-opt' + (k===state.style?' is-active':'') + '" data-style="' + k + '">' +
      '<span class="tryon-opt-label">' + s.label + '</span><span class="tryon-opt-hint">' + s.hint + '</span></button>';
  }).join('');
  els.curls.innerHTML = CURL_ORDER.map(function(k){
    return '<button type="button" class="tryon-curl-opt' + (k===state.curl?' is-active':'') + '" data-curl="' + k + '">' + CURL_LABEL[k] + '</button>';
  }).join('');
  updateChosen();
}

function updateChosen(){
  var s = STYLE_DATA[state.style];
  var likedKey = state.style + '|' + state.curl;
  els.chosen.textContent = 'Выбрано: ' + s.label + ', изгиб ' + CURL_LABEL[state.curl];
  els.like.classList.toggle('is-active', state.liked.has(likedKey));
  els.like.textContent = state.liked.has(likedKey) ? '♥ В избранном' : '♡ Нравится';
}

function rerender(){
  if(state.mode === 'auto') renderLashes();
  else if(state.mode === 'manual') renderManualLashes();
}

function wireControls(){
  els.styles.addEventListener('click', function(e){
    var btn = e.target.closest('[data-style]'); if(!btn) return;
    state.style = btn.dataset.style;
    els.styles.querySelectorAll('.tryon-opt').forEach(function(b){ b.classList.toggle('is-active', b===btn); });
    updateChosen(); rerender();
  });
  els.curls.addEventListener('click', function(e){
    var btn = e.target.closest('[data-curl]'); if(!btn) return;
    state.curl = btn.dataset.curl;
    els.curls.querySelectorAll('.tryon-curl-opt').forEach(function(b){ b.classList.toggle('is-active', b===btn); });
    updateChosen(); rerender();
  });
  els.like.addEventListener('click', function(){
    var key = state.style + '|' + state.curl;
    if(state.liked.has(key)) state.liked.delete(key); else state.liked.add(key);
    updateChosen();
  });
  els.book.addEventListener('click', function(){
    var select = $('service');
    var booking = $('booking');
    if(select){
      var wanted = SERVICE_MAP[state.style];
      for(var i=0;i<select.options.length;i++){
        if(select.options[i].text === wanted){ select.selectedIndex = i; break; }
      }
    }
    if(booking) booking.scrollIntoView({behavior:'smooth', block:'start'});
    var name = $('name'); if(name) setTimeout(function(){ name.focus(); }, 400);
  });
  els.dropzone.addEventListener('click', function(e){
    if(e.target === els.file) return;
    els.file.click();
  });
  els.file.addEventListener('change', function(){ if(els.file.files[0]) handleFile(els.file.files[0]); });
  els.reset.addEventListener('click', resetTryOn);
  ['dragover','dragenter'].forEach(function(ev){
    els.dropzone.addEventListener(ev, function(e){ e.preventDefault(); els.dropzone.classList.add('is-drag'); });
  });
  ['dragleave','drop'].forEach(function(ev){
    els.dropzone.addEventListener(ev, function(e){ e.preventDefault(); els.dropzone.classList.remove('is-drag'); });
  });
  els.dropzone.addEventListener('drop', function(e){
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if(f) handleFile(f);
  });
}

function init(){
  els = {
    dropzone: $('tryon2Drop'),
    pickBtn: $('tryon2Pick'),
    file: $('tryon2File'),
    canvasWrap: $('tryon2CanvasWrap'),
    canvas: $('tryon2Canvas'),
    manualLayer: $('tryon2ManualLayer'),
    status: $('tryon2Status'),
    reset: $('tryon2Reset'),
    styles: $('tryon2Styles'),
    curls: $('tryon2Curls'),
    chosen: $('tryon2Chosen'),
    like: $('tryon2Like'),
    book: $('tryon2Book')
  };
  if(!els.dropzone) return;
  buildOptionButtons();
  wireControls();
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
