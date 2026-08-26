/* Экспресс-тест «Какой изгиб и объём вам подходят» — короткий шаринг-квиз для органического трафика.
   Использует ту же линейку стилей/изгибов, что и примерочная (assets/tryon.js), и переиспользует
   функцию lashPath(), которая уже определена в каждом файле сайта (для блока «Изгибы»). */
(function(){

var QUESTIONS = [
  {
    question:'Особенность ваших глаз',
    options:[
      {label:'Нависшее веко', curl:'b'},
      {label:'Миндалевидные глаза', curl:'c'},
      {label:'Глубоко посаженные', curl:'cc'},
      {label:'Монолид (азиатский разрез)', curl:'d'}
    ]
  },
  {
    question:'Какой эффект вам ближе',
    options:[
      {label:'Максимально естественный, 1 к 1', style:'classic'},
      {label:'Лёгкая текстура без театральности', style:'hybrid'},
      {label:'Заметный, воздушный объём', style:'volume2d3d'},
      {label:'Очень пышный, эффект макияжа', style:'volume5d'}
    ]
  },
  {
    question:'Повод',
    options:[
      {label:'Повседневная жизнь', boost:null},
      {label:'Особый случай — свадьба, фотосессия', boost:'up'},
      {label:'Хочу максимальный вау-эффект', boost:'mega'}
    ]
  }
];

var STYLE_ORDER = ['classic','hybrid','volume2d3d','volume5d','mega'];
var STYLE_INFO = {
  classic:    { label:'Классика', desc:'Естественный эффект один к одному — глаза выглядят просто «своими», только выразительнее.' },
  hybrid:     { label:'Гибрид',   desc:'Лёгкая текстура и мягкая пушистость без театральности — для тех, кто хочет чуть больше, чем классику.' },
  volume2d3d: { label:'Объём 2D–3D', desc:'Заметный, воздушный объём — популярный выбор на каждый день с акцентом.' },
  volume5d:   { label:'Объём 5D+',   desc:'Пышные плотные пучки — взгляд сразу читается издалека, эффект макияжа без туши.' },
  mega:       { label:'Мега объём',  desc:'Максимальная густота и драма — для особых случаев и тех, кто ничего не боится.' }
};
var CURL_INFO = {
  b:  { label:'B',  title:'Деликатный подъём' },
  c:  { label:'C',  title:'Классический изгиб' },
  cc: { label:'CC', title:'Усиленный изгиб' },
  d:  { label:'D',  title:'Максимальный изгиб' }
};
var SERVICE_MAP = {
  classic:'Классическое наращивание',
  hybrid:'2D объём',
  volume2d3d:'3D–5D объём',
  volume5d:'3D–5D объём',
  mega:'Мега объём'
};

var els = {};
var answers = [];

function $(id){ return document.getElementById(id); }

function updateProgress(fraction){
  if(els.progressFill) els.progressFill.style.width = (fraction*100) + '%';
}

function renderQuestion(i){
  var q = QUESTIONS[i];
  updateProgress(i / QUESTIONS.length);
  els.stage.innerHTML =
    '<div class="quiz-question">' +
      '<div class="quiz-question-num">Вопрос ' + (i+1) + ' из ' + QUESTIONS.length + '</div>' +
      '<h3>' + q.question + '</h3>' +
      '<div class="quiz-options">' +
        q.options.map(function(o,idx){ return '<button type="button" class="quiz-opt" data-idx="'+idx+'">'+o.label+'</button>'; }).join('') +
      '</div>' +
      (i>0 ? '<button type="button" class="quiz-back">← Назад</button>' : '') +
    '</div>';
  els.stage.querySelectorAll('.quiz-opt').forEach(function(btn){
    btn.addEventListener('click', function(){
      answers[i] = q.options[+btn.dataset.idx];
      if(i+1 < QUESTIONS.length) renderQuestion(i+1);
      else renderResult();
    });
  });
  var back = els.stage.querySelector('.quiz-back');
  if(back) back.addEventListener('click', function(){ renderQuestion(i-1); });
}

function computeResult(){
  var curl = answers[0].curl;
  var style = answers[1].style;
  var boost = answers[2].boost;
  if(boost === 'mega'){
    style = 'mega';
  }else if(boost === 'up'){
    var idx = STYLE_ORDER.indexOf(style);
    style = STYLE_ORDER[Math.min(idx+1, STYLE_ORDER.length-1)];
  }
  return { curl: curl, style: style };
}

function renderResult(){
  updateProgress(1);
  var result = computeResult();
  var si = STYLE_INFO[result.style], ci = CURL_INFO[result.curl];
  els.stage.innerHTML =
    '<div class="quiz-result">' +
      '<span class="eyebrow">Ваш результат</span>' +
      '<h3>' + si.label + ' · изгиб ' + ci.label + '</h3>' +
      '<div class="quiz-result-curl">' + ci.title + '</div>' +
      '<svg class="quiz-result-svg lash-svg" viewBox="0 0 220 140"></svg>' +
      '<p class="quiz-result-desc">' + si.desc + '</p>' +
      '<div class="quiz-result-actions">' +
        '<button type="button" class="btn btn-primary" id="quizTryonBtn">Примерить на своём фото</button>' +
        '<button type="button" class="btn btn-outline" id="quizBookBtn">Записаться на этот образ</button>' +
      '</div>' +
      '<button type="button" class="quiz-download" id="quizDownloadBtn">⬇ Сохранить карточку с результатом</button>' +
      '<button type="button" class="quiz-restart" id="quizRestartBtn">Пройти ещё раз</button>' +
    '</div>';

  var svg = els.stage.querySelector('.quiz-result-svg');
  if(typeof window.lashPath === 'function' && svg){
    try{ window.lashPath(svg, result.curl, true); }catch(e){}
  }

  var tryonBtn = $('quizTryonBtn');
  if(tryonBtn){
    tryonBtn.addEventListener('click', function(){
      var styleBtn = document.querySelector('#tryonStyles [data-style="'+result.style+'"]');
      var curlBtn = document.querySelector('#tryonCurls [data-curl="'+result.curl+'"]');
      if(styleBtn) styleBtn.click();
      if(curlBtn) curlBtn.click();
      var tryonSection = $('tryon');
      if(tryonSection) tryonSection.scrollIntoView({behavior:'smooth', block:'start'});
    });
  }

  var bookBtn = $('quizBookBtn');
  if(bookBtn){
    bookBtn.addEventListener('click', function(){
      var select = $('service');
      if(select){
        var wanted = SERVICE_MAP[result.style];
        for(var k=0;k<select.options.length;k++){
          if(select.options[k].text === wanted){ select.selectedIndex = k; break; }
        }
      }
      var booking = $('booking');
      if(booking) booking.scrollIntoView({behavior:'smooth', block:'start'});
      var name = $('name'); if(name) setTimeout(function(){ name.focus(); }, 400);
    });
  }

  var downloadBtn = $('quizDownloadBtn');
  if(downloadBtn) downloadBtn.addEventListener('click', function(){ downloadResultCard(result.style, result.curl); });

  var restartBtn = $('quizRestartBtn');
  if(restartBtn) restartBtn.addEventListener('click', function(){ answers = []; renderQuestion(0); });
}

/* ---------- скачиваемая карточка-результат (canvas, фирменный тёмно-золотой стиль всегда,
   независимо от текущей темы сайта — чтобы карточка одинаково хорошо смотрелась в сторис) ---------- */
function drawLashIllustration(ctx, originX, originY, scale, curlKey, styleKey){
  var CURL_BEND = {b:16,c:36,cc:54,d:74};
  var DENSITY = {classic:7,hybrid:9,volume2d3d:11,volume5d:13,mega:15};
  var bend = CURL_BEND[curlKey], count = DENSITY[styleKey];
  var lenBase = 40 + (count-7)*1.4;
  function pt(t){ return { x: t*160-80, y: -16*Math.sin(Math.PI*t) }; }
  ctx.save();
  ctx.translate(originX, originY);
  ctx.scale(scale, scale);
  var p0 = pt(0), p1 = pt(1), mid = pt(0.5);
  ctx.strokeStyle = 'rgba(244,233,214,.55)'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(p0.x,p0.y); ctx.quadraticCurveTo(mid.x, mid.y-6, p1.x,p1.y); ctx.stroke();
  ctx.strokeStyle = 'rgba(179,160,132,.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(p0.x,p0.y+2); ctx.quadraticCurveTo(mid.x, mid.y+38, p1.x,p1.y+2); ctx.stroke();
  ctx.fillStyle = 'rgba(122,90,36,.55)';
  ctx.beginPath(); ctx.ellipse(mid.x, mid.y+24, 24,14,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#2a1c0c';
  ctx.beginPath(); ctx.arc(mid.x, mid.y+24, 6,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#e8c876'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  for(var i=0;i<count;i++){
    var t = i/(count-1);
    var r = pt(t);
    var a = (-100 + t*30) * Math.PI/180;
    var d0 = {x:Math.cos(a), y:Math.sin(a)};
    var L = lenBase * (0.7 + 0.5*t);
    var p1x = r.x + d0.x*L*0.55, p1y = r.y + d0.y*L*0.55;
    var b2 = (-100 + t*30 - bend) * Math.PI/180;
    var d1 = {x:Math.cos(b2), y:Math.sin(b2)};
    var p2x = p1x + d1.x*L*0.45, p2y = p1y + d1.y*L*0.45;
    ctx.beginPath(); ctx.moveTo(r.x,r.y); ctx.quadraticCurveTo(p1x,p1y,p2x,p2y); ctx.stroke();
  }
  ctx.restore();
}

function downloadResultCard(style, curl){
  var si = STYLE_INFO[style], ci = CURL_INFO[curl];
  var W = 1080, H = 1350;
  var canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  var ctx = canvas.getContext('2d');

  var bg = ctx.createLinearGradient(0,0,W,H);
  bg.addColorStop(0,'#180f09'); bg.addColorStop(0.55,'#0f0a06'); bg.addColorStop(1,'#180f09');
  ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);

  ctx.strokeStyle = 'rgba(201,162,74,.45)'; ctx.lineWidth = 2;
  ctx.strokeRect(36,36,W-72,H-72);
  ctx.strokeStyle = 'rgba(201,162,74,.22)'; ctx.lineWidth = 1;
  ctx.strokeRect(48,48,W-96,H-96);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#c9a24a';
  ctx.font = '700 26px Georgia, serif';
  ctx.save(); ctx.letterSpacing = '6px';
  ctx.fillText('А Л Е К С А Н Д Р А   Р У Л Е В А', W/2, 160);
  ctx.restore();

  ctx.fillStyle = '#8a7457';
  ctx.font = 'italic 400 32px Georgia, serif';
  ctx.fillText('Ваш идеальный образ', W/2, 250);

  ctx.fillStyle = '#f6dfa0';
  ctx.font = 'italic 800 92px Georgia, serif';
  ctx.fillText(si.label, W/2, 400);

  ctx.fillStyle = '#cbb8a0';
  ctx.font = '400 38px Georgia, serif';
  ctx.fillText('Изгиб ' + ci.label + ' — ' + ci.title, W/2, 460);

  drawLashIllustration(ctx, W/2, 720, 3.2, curl, style);

  ctx.fillStyle = '#b3a084';
  ctx.font = '400 30px Georgia, serif';
  wrapText(ctx, si.desc, W/2, 950, 760, 42);

  ctx.strokeStyle = 'rgba(201,162,74,.4)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(W/2-90, 1130); ctx.lineTo(W/2+90, 1130); ctx.stroke();

  ctx.fillStyle = '#c9a24a';
  ctx.font = '700 28px Georgia, serif';
  ctx.fillText('Наращивание и ламинирование ресниц', W/2, 1190);
  ctx.fillStyle = '#8a7457';
  ctx.font = '400 24px Georgia, serif';
  ctx.fillText('Пройдите тест сами — на сайте Александры', W/2, 1230);

  canvas.toBlob(function(blob){
    if(!blob) return;
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'moy-obraz-alexandra-ruleva.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
  });
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight){
  var words = text.split(' ');
  var line = '';
  var lines = [];
  for(var n=0;n<words.length;n++){
    var testLine = line + words[n] + ' ';
    if(ctx.measureText(testLine).width > maxWidth && n > 0){
      lines.push(line);
      line = words[n] + ' ';
    }else{
      line = testLine;
    }
  }
  lines.push(line);
  var startY = y - (lines.length-1)*lineHeight/2;
  lines.forEach(function(l,i){ ctx.fillText(l.trim(), x, startY + i*lineHeight); });
}

function init(){
  els = { stage: $('quizStage'), progressFill: $('quizProgressFill') };
  if(!els.stage) return;
  renderQuestion(0);
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
