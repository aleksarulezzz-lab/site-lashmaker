/* Виртуальная примерочная — автоматическое наложение ресниц по точкам века (MediaPipe Face Landmarker).
   Фото обрабатывается только в браузере клиентки и никуда не отправляется. */
(function(){

var STYLE_DATA = {
  classic:    { key:'classic',    label:'Классика',      hint:'Естественный эффект, 1 к 1',        density:16, fanCount:1, lengthRatio:0.24, baseWidth:1.7, opacity:0.90 },
  hybrid:     { key:'hybrid',     label:'Гибрид',         hint:'Текстура без театральности',        density:17, fanCount:2, lengthRatio:0.26, baseWidth:1.5, opacity:0.90 },
  volume2d3d: { key:'volume2d3d', label:'Объём 2D–3D',    hint:'Заметный, воздушный объём',         density:16, fanCount:3, lengthRatio:0.28, baseWidth:1.3, opacity:0.90 },
  volume5d:   { key:'volume5d',   label:'Объём 5D+',      hint:'Пышные плотные пучки',               density:15, fanCount:5, lengthRatio:0.30, baseWidth:1.15, opacity:0.92 },
  mega:       { key:'mega',       label:'Мега объём',     hint:'Максимальная густота и драма',       density:14, fanCount:7, lengthRatio:0.33, baseWidth:1.0,  opacity:0.94 }
};
var STYLE_ORDER = ['classic','hybrid','volume2d3d','volume5d','mega'];

var CURL_RENDER = { b:8, c:17, cc:25, d:35 };
var CURL_ORDER = ['b','c','cc','d'];
var CURL_LABEL = { b:'B', c:'C', cc:'CC', d:'D' };

var SERVICE_MAP = {
  classic:'Классическое наращивание',
  hybrid:'2D объём',
  volume2d3d:'3D–5D объём',
  volume5d:'3D–5D объём',
  mega:'Мега объём'
};

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
function norm(a){var l=len(a)||1;return {x:a.x/l,y:a.y/l};}
function avgPoint(pts){var s={x:0,y:0};pts.forEach(function(p){s.x+=p.x;s.y+=p.y;});return {x:s.x/pts.length,y:s.y/pts.length};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
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

/* ---------- рисование одного тонкого сужающегося волоска (не линия, а залитый "иглообразный" контур) ---------- */
function rotateVec(v, deg){
  var r = deg*Math.PI/180, c = Math.cos(r), s = Math.sin(r);
  return {x: v.x*c - v.y*s, y: v.x*s + v.y*c};
}
/* поворачивает dir на угол bendDeg в сторону perp (perp — единичный перпендикуляр, уже с нужным знаком).
   Угловой поворот вместо бокового смещения — так изгиб виден чётко в любом стиле густоты,
   а кончик волоска остаётся строго на расстоянии lashLen от корня (не "выезжает" за веко). */
function rotateToward(dir, perp, bendDeg){
  var r = bendDeg*Math.PI/180, c = Math.cos(r), s = Math.sin(r);
  return { x: dir.x*c + perp.x*s, y: dir.y*c + perp.y*s };
}
function fillTaperedStrand(ctx, base, dir, perp, lashLen, bendDeg, baseWidth, color){
  var midDir = rotateToward(dir, perp, bendDeg*0.55);
  var tipDir = rotateToward(dir, perp, bendDeg);
  var control = add(base, scl(midDir, lashLen*0.54));
  var tip     = add(base, scl(tipDir, lashLen*0.95));
  var N = 7, left = [], right = [], prev = base;
  for(var i=0;i<=N;i++){
    var t = i/N, mt = 1-t;
    var x = mt*mt*base.x + 2*mt*t*control.x + t*t*tip.x;
    var y = mt*mt*base.y + 2*mt*t*control.y + t*t*tip.y;
    var dxs = x-prev.x, dys = y-prev.y;
    var l = Math.hypot(dxs,dys) || 1;
    var nx = -dys/l, ny = dxs/l;
    var w = baseWidth*(1-t*0.86) + 0.12;
    left.push({x:x+nx*w/2, y:y+ny*w/2});
    right.push({x:x-nx*w/2, y:y-ny*w/2});
    prev = {x:x,y:y};
  }
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for(i=1;i<left.length;i++) ctx.lineTo(left[i].x, left[i].y);
  for(i=right.length-1;i>=0;i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/* ---------- рисование ресниц вдоль линии века: пучки тонких волосков на точку роста ---------- */
function drawLashesOnEye(ctx, upperPts, lowerCenter, outerPt, innerPt, style, curlBend){
  var eyeWidth = dist(outerPt, innerPt);
  if(eyeWidth < 1) return;
  var outerDir = norm(sub(outerPt, innerPt));
  var total = polylineLength(upperPts);
  var n = style.density;
  var refScale = ctx.canvas.width/520;
  var minLen = ctx.canvas.width*0.014;
  var color = 'rgba(20,14,10,' + style.opacity + ')';
  /* направление "завитка" считаем ОДИН раз для всего глаза (по средней точке века),
     а не в каждой точке — иначе у внутреннего/внешнего уголка знак может перевернуться
     и ресницы начинают смотреть в разные стороны ("растрёпанный" эффект) */
  var midNormal = norm(sub(pointAtLength(upperPts, total*0.5), lowerCenter));
  var hookSign = (-midNormal.y*outerDir.x + midNormal.x*outerDir.y) >= 0 ? 1 : -1;
  /* не ставим волоски в самые уголки: там ресниц почти нет, а любой промах точек
     века виден как "хвост", уезжающий за пределы глаза */
  var tLo = 0.10, tHi = 0.92;
  for(var i=0;i<n;i++){
    var t = tLo + (tHi - tLo) * ((i+0.5)/n);
    var base = pointAtLength(upperPts, t*total);
    /* направление роста: смесь локальной нормали с общей нормалью глаза (55%),
       чтобы у уголков волоски не разворачивало наружу веером */
    var rawNormal = norm(sub(base, lowerCenter));
    var normal = norm(add(scl(rawNormal, 0.45), scl(midNormal, 0.55)));
    /* t≈0 — внешний уголок, t≈1 — внутренний. Длина плавно растёт к внешнему
       уголку ("кошачий" эффект), но разброс небольшой — не в 2.4 раза. */
    var outerness = 1-t;
    var smooth = outerness*outerness*(3-2*outerness);
    var lenScale = 0.62+0.38*smooth;
    var fanCount = style.fanCount;
    var spreadDeg = fanCount>1 ? Math.min(5 + fanCount*1.1, 12) : 0;
    for(var j=0;j<fanCount;j++){
      var angleOffset = fanCount>1 ? (j-(fanCount-1)/2)/(fanCount-1)*spreadDeg : 0;
      var dir = rotateVec(normal, angleOffset);
      var perp = hookSign>=0 ? {x:-dir.y, y:dir.x} : {x:dir.y, y:-dir.x};
      var jitter = pseudoRand(i*13 + j*7);
      var lashLen = Math.max(eyeWidth*style.lengthRatio*lenScale*(0.94+0.12*jitter), minLen*lenScale);
      lashLen = Math.min(lashLen, eyeWidth*0.32);   /* жёсткий потолок длины */
      var bw = style.baseWidth*refScale*(0.95+0.1*pseudoRand(i*3+j*11));
      var bendDeg = curlBend * (0.75 + 0.25*lenScale);
      fillTaperedStrand(ctx, base, dir, perp, lashLen, bendDeg, bw, color);
    }
  }
}

/* ---------- состояние ---------- */
var state = { style:'volume2d3d', curl:'c', mode:'idle', liked:new Set() };
var els = {};
var canvasCtx = null, loadedImage = null, eyeData = null, objectUrl = null;
var faceLandmarkerPromise = null;
var manualPos = [ {x:30,y:42,scale:1}, {x:66,y:42,scale:1} ];

function $(id){ return document.getElementById(id); }

function setStatus(msg, isError){
  if(!els.status) return;
  els.status.textContent = msg || '';
  els.status.classList.toggle('is-error', !!isError);
  els.status.hidden = !msg;
}

function getFaceLandmarker(){
  if(!faceLandmarkerPromise){
    faceLandmarkerPromise = (async function(){
      var mod = await import(MEDIAPIPE_PKG);
      var files = await mod.FilesetResolver.forVisionTasks(MEDIAPIPE_PKG + '/wasm');
      return await mod.FaceLandmarker.createFromOptions(files, {
        baseOptions:{ modelAssetPath: MODEL_URL, delegate:'CPU' },
        runningMode:'IMAGE',
        numFaces:1
      });
    })();
  }
  return faceLandmarkerPromise;
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
  var style = STYLE_DATA[state.style];
  var curlBend = CURL_RENDER[state.curl];
  eyeData.forEach(function(eye){
    drawLashesOnEye(canvasCtx, eye.upperPts, eye.lowerCenter, eye.outerPt, eye.innerPt, style, curlBend);
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
    var inner = canvas; inner.style.transform = idx===1 ? 'scaleX(-1)' : '';
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
  var style = STYLE_DATA[state.style];
  var curlBend = CURL_RENDER[state.curl];
  var t = MANUAL_TEMPLATE;
  drawLashesOnEye(ctx, t.upperPts, t.lower, t.outer, t.inner, style, curlBend);
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

/* ---------- UI: стили / изгиб / лайк / запись ---------- */
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
    dropzone: $('tryonDrop'),
    pickBtn: $('tryonPick'),
    file: $('tryonFile'),
    canvasWrap: $('tryonCanvasWrap'),
    canvas: $('tryonCanvas'),
    manualLayer: $('tryonManualLayer'),
    status: $('tryonStatus'),
    reset: $('tryonReset'),
    styles: $('tryonStyles'),
    curls: $('tryonCurls'),
    chosen: $('tryonChosen'),
    like: $('tryonLike'),
    book: $('tryonBook')
  };
  if(!els.dropzone) return;
  buildOptionButtons();
  wireControls();
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
