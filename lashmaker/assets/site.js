/* activate the preloaded Google Fonts stylesheet without a render-blocking <link> */
(function(){var l=document.getElementById('gfonts');if(l&&l.rel!=='stylesheet')l.rel='stylesheet';})();

document.querySelectorAll('.theme-toggle').forEach(btn=>{
  btn.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if(isLight){
      document.documentElement.removeAttribute('data-theme');
      try{ localStorage.setItem('lashSiteTheme', 'dark'); }catch(e){}
    }else{
      document.documentElement.setAttribute('data-theme', 'light');
      try{ localStorage.setItem('lashSiteTheme', 'light'); }catch(e){}
    }
  });
});
const CURL_DATA = {
  b:  { label:'B', name:'Лёгкий изгиб B', bend:16, eye:'Нависшее веко, прямые от природы ресницы', text:'Мягкий, почти незаметный подъём. Сохраняет естественность и не утяжеляет взгляд — идеален при нависшем веке.' },
  c:  { label:'C', name:'Классический изгиб C', bend:36, eye:'Миндалевидные и близко посаженные глаза', text:'Самый популярный изгиб. Аккуратно распахивает взгляд и подходит практически любой форме глаз.' },
  cc: { label:'CC', name:'Усиленный изгиб CC', bend:54, eye:'Круглые и глубоко посаженные глаза', text:'Среднее между C и D: заметный подъём и эффект макияжа без излишней театральности.' },
  d:  { label:'D', name:'Максимальный изгиб D', bend:74, eye:'Монолид, азиатский разрез глаз', text:'Самый крутой изгиб для эффекта «кукольного» распахнутого взгляда. Отлично держит форму на монолиде.' }
};
function lashPath(svg, curlKey, after){
  const ns='http://www.w3.org/2000/svg';
  svg.innerHTML='';
  const bend = after ? CURL_DATA[curlKey].bend : 10;
  const count = after ? 11 : 6;
  const lenBase = after ? 46 : 26;
  const strokeW = after ? 2.6 : 1.6;
  const roots=[];
  for(let i=0;i<count;i++){
    const t=i/(count-1);
    roots.push({x:30+t*160, y:95-16*Math.sin(Math.PI*t), t});
  }
  const mid = roots[Math.floor((count-1)/2)];
  const iris=document.createElementNS(ns,'ellipse');
  iris.setAttribute('cx',mid.x); iris.setAttribute('cy',mid.y+24);
  iris.setAttribute('rx',24); iris.setAttribute('ry',14);
  iris.setAttribute('class','iris-shape');
  svg.appendChild(iris);
  const pupil=document.createElementNS(ns,'circle');
  pupil.setAttribute('cx',mid.x); pupil.setAttribute('cy',mid.y+24); pupil.setAttribute('r',6);
  pupil.setAttribute('class','pupil-shape');
  svg.appendChild(pupil);
  const lower=document.createElementNS(ns,'path');
  lower.setAttribute('d', `M ${roots[0].x},${roots[0].y+2} Q ${mid.x},${mid.y+38} ${roots[count-1].x},${roots[count-1].y+2}`);
  lower.setAttribute('class','lower-stroke'); lower.setAttribute('fill','none');
  svg.appendChild(lower);
  roots.forEach(r=>{
    const a=-100 + r.t*30;
    const rad=a*Math.PI/180;
    const d0={x:Math.cos(rad),y:Math.sin(rad)};
    const L=lenBase*(0.7+0.5*r.t);
    const p1={x:r.x+d0.x*L*0.55, y:r.y+d0.y*L*0.55};
    const b2=a-bend, rad2=b2*Math.PI/180;
    const d1={x:Math.cos(rad2),y:Math.sin(rad2)};
    const p2={x:p1.x+d1.x*L*0.45, y:p1.y+d1.y*L*0.45};
    const path=document.createElementNS(ns,'path');
    path.setAttribute('d',`M ${r.x.toFixed(1)},${r.y.toFixed(1)} Q ${p1.x.toFixed(1)},${p1.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`);
    path.setAttribute('class','lash-stroke');
    path.setAttribute('stroke-width',strokeW);
    path.setAttribute('fill','none');
    path.setAttribute('stroke-linecap','round');
    svg.appendChild(path);
  });
  const lid=document.createElementNS(ns,'path');
  lid.setAttribute('d', `M ${roots[0].x},${roots[0].y} Q ${mid.x},${mid.y-6} ${roots[count-1].x},${roots[count-1].y}`);
  lid.setAttribute('class','lid-stroke'); lid.setAttribute('fill','none');
  svg.appendChild(lid);
}
/* warm gold dust drifting around Alexandra's portrait */
const heroPortraitFrame = document.querySelector('.hero-portrait-frame');
if(heroPortraitFrame){
  [[8,18],[92,14],[88,50],[6,58],[94,80],[14,88]].forEach(([x,y],i)=>{
    const sp = document.createElement('span');
    sp.className='hero-sparkle';
    sp.style.left = x+'%'; sp.style.top = y+'%';
    sp.style.animationDelay = (i*0.5)+'s';
    heroPortraitFrame.appendChild(sp);
  });
}
const PORTFOLIO = [
  {cat:'classic',    title:'Классика',      sub:'натуральный эффект',        img:'work-classic.jpg',    w:1100, h:797},
  {cat:'volume2d',   title:'2D объём',      sub:'лёгкая пушистость',         img:'work-2d.jpg',         w:1100, h:733},
  {cat:'volume3d',   title:'3D объём',      sub:'выразительный, эффект макияжа', img:'work-3d.jpg',      w:1100, h:825},
  {cat:'lamination', title:'Ламинирование', sub:'подъём и блеск своих ресниц', img:'work-lamination.jpg', w:1100, h:953},
];
const grid = document.getElementById('portfolioGrid');
PORTFOLIO.forEach(item=>{
  const div = document.createElement('div');
  div.className='photo-card reveal';
  div.dataset.category=item.cat;
  const thumb = item.img
    ? `<img class="photo-photo" src="assets/works/${item.img}" alt="Пример работы: ${item.title}" width="${item.w}" height="${item.h}" loading="lazy" decoding="async">`
    : `<svg class="orn-watermark" viewBox="0 0 100 100"><use href="#flourish-fleur"></use></svg><svg class="lash-thumb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/></svg>`;
  div.innerHTML = `<div class="photo-thumb">${thumb}</div>
  <div class="photo-cap">${item.title}<span>${item.sub}</span></div>`;
  grid.appendChild(div);
});
document.querySelectorAll('.filter-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('is-active'));
    btn.classList.add('is-active');
    const cat = btn.dataset.filter;
    document.querySelectorAll('.photo-card').forEach(card=>{
      card.style.display = (cat==='all' || card.dataset.category===cat) ? '' : 'none';
    });
  });
});
const MODELS = [
  {curl:'b', title:'Нависшее веко', text:'Сохраняем лёгкость, не утяжеляя складку века.'},
  {curl:'c', title:'Миндалевидные глаза', text:'Универсальный вариант на каждый день.'},
  {curl:'cc', title:'Глубоко посаженные', text:'Дополнительно открываем взгляд.'},
  {curl:'d', title:'Монолид', text:'Максимальный подъём и эффект распахнутых глаз.'},
];
const curlCardsWrap = document.getElementById('curlCards');
MODELS.forEach(m=>{
  const card=document.createElement('div');
  card.className='curl-card reveal';
  card.dataset.curl=m.curl;
  card.dataset.state='after';
  card.innerHTML = `
    <div class="curl-badge">Изгиб ${CURL_DATA[m.curl].label}</div>
    <h4>${m.title}</h4>
    <svg class="lash-svg" viewBox="0 0 220 140"></svg>
    <p>${m.text}</p>
    <div class="lash-toggle">
      <button data-state="before">До</button>
      <button class="is-active" data-state="after">После</button>
    </div>`;
  curlCardsWrap.appendChild(card);
  lashPath(card.querySelector('.lash-svg'), m.curl, true);
});
curlCardsWrap.addEventListener('click', e=>{
  const btn = e.target.closest('.lash-toggle button');
  if(!btn) return;
  const card = btn.closest('.curl-card');
  card.querySelectorAll('.lash-toggle button').forEach(b=>b.classList.remove('is-active'));
  btn.classList.add('is-active');
  const state = btn.dataset.state;
  card.dataset.state = state;
  lashPath(card.querySelector('.lash-svg'), card.dataset.curl, state==='after');
});
const showcase = document.getElementById('curlShowcase');
function renderShowcase(key){
  const d = CURL_DATA[key];
  showcase.querySelector('.showcase-title').textContent = d.name;
  showcase.querySelector('.showcase-text').textContent = d.text;
  showcase.querySelector('.showcase-eye').textContent = 'Кому подходит: ' + d.eye;
  showcase.dataset.curl = key;
  const state = showcase.dataset.state || 'after';
  lashPath(showcase.querySelector('.lash-svg'), key, state==='after');
  document.querySelectorAll('.curl-card').forEach(card=>{
    card.classList.toggle('is-recommended', card.dataset.curl===key);
  });
}
document.querySelectorAll('.curl-tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.curl-tab').forEach(t=>t.classList.remove('is-active'));
    tab.classList.add('is-active');
    showcase.dataset.state = 'after';
    showcase.querySelectorAll('.lash-toggle button').forEach(b=>b.classList.toggle('is-active', b.dataset.state==='after'));
    renderShowcase(tab.dataset.curl);
  });
});
showcase.querySelectorAll('.lash-toggle button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    showcase.querySelectorAll('.lash-toggle button').forEach(b=>b.classList.remove('is-active'));
    btn.classList.add('is-active');
    showcase.dataset.state = btn.dataset.state;
    lashPath(showcase.querySelector('.lash-svg'), showcase.dataset.curl, btn.dataset.state==='after');
  });
});
renderShowcase('c');
const CARE = [
  'Не мочите ресницы первые 4 часа после процедуры — клей набирает полную прочность.',
  'Расчёсывайте ресницы специальной щёточкой утром и вечером — это сохраняет форму.',
  'Избегайте средств с маслами в составе: они разрушают клеевую связку.',
  'Спите на спине или используйте шёлковую наволочку, чтобы ресницы не заламывались.',
  'Не трите глаза руками и откажитесь от водостойкой туши на нарощенных ресницах.',
  'Приходите на коррекцию каждые 2–3 недели — так взгляд всегда выглядит безупречно.',
];
const careGrid = document.getElementById('careGrid');
CARE.forEach((text,i)=>{
  const el=document.createElement('div');
  el.className='care-card reveal';
  el.innerHTML = `<div class="care-num">0${i+1}</div><h4>Совет ${i+1}</h4><p>${text}</p>`;
  careGrid.appendChild(el);
});
// Демо-заглушки. На реальном сайте сюда подставляются настоящие отзывы.
const REVIEWS = [
  {name:'Пример отзыва', text:'Хожу к мастеру уже год, ресницы всегда выглядят натурально и держатся до самой коррекции. Очень аккуратная работа.'},
  {name:'Пример отзыва', text:'Делала 2D перед свадьбой, фотографии вышли потрясающие, глаза совсем другие. Спасибо огромное.'},
  {name:'Пример отзыва', text:'Ламинирование ресниц оказалось находкой. Месяц не крашу их, а взгляд всегда выглядит свежим и приподнятым.'},
];
const reviewsGrid = document.getElementById('reviewsGrid');
REVIEWS.forEach(r=>{
  const el=document.createElement('div');
  el.className='review-card reveal';
  el.innerHTML = `<div class="stars">★★★★★</div><p>«${r.text}»</p>
  <div class="review-author"><div class="review-avatar"></div><div><b>${r.name}</b><span>демонстрационный текст</span></div></div>`;
  reviewsGrid.appendChild(el);
});
const navToggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.nav');
navToggle.addEventListener('click', ()=>nav.classList.toggle('is-open'));
document.querySelectorAll('.nav a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('is-open')));
/* flourish dividers */
const DIVIDER_SVG = `<svg viewBox="0 0 400 40" class="flourish-divider-svg" aria-hidden="true">
  <path class="fl-path" pathLength="1000" d="M206,20 C230,20 234,8 252,10 C268,12 266,26 250,26 C263,30 284,23 300,20 C330,12 356,24 386,20" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <path class="fl-path" pathLength="1000" d="M194,20 C170,20 166,8 148,10 C132,12 134,26 150,26 C137,30 116,23 100,20 C70,12 44,24 14,20" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <rect x="194" y="14" width="12" height="12" transform="rotate(45 200 20)" fill="currentColor"/>
</svg>`;
document.getElementById('divider-1').innerHTML = DIVIDER_SVG;
document.getElementById('divider-2').innerHTML = DIVIDER_SVG;
/* 3D tilt-on-hover */
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function attachTilt(el, maxDeg){
  if(!el || prefersReducedMotion) return;
  el.addEventListener('mousemove', e=>{
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left)/r.width - 0.5;
    const py = (e.clientY - r.top)/r.height - 0.5;
    el.style.transition = 'none';
    el.style.transform = `perspective(900px) rotateX(${(-py*maxDeg).toFixed(2)}deg) rotateY(${(px*maxDeg).toFixed(2)}deg) translateY(-4px)`;
  });
  el.addEventListener('mouseleave', ()=>{
    el.style.transition = '';
    el.style.transform = '';
  });
}
document.querySelectorAll('.service-card').forEach(c=>attachTilt(c,6));
document.querySelectorAll('.curl-card').forEach(c=>attachTilt(c,7));
document.querySelectorAll('.reveal-group').forEach(group=>{
  Array.from(group.children).forEach((el,i)=>{ el.classList.add('reveal'); el.style.transitionDelay = (i*0.08)+'s'; });
});
[document.querySelector('.services-grid'), document.getElementById('portfolioGrid'), document.getElementById('curlCards'), document.getElementById('careGrid'), document.getElementById('reviewsGrid')].forEach(group=>{
  Array.from(group.children).forEach((el,i)=>{ el.style.transitionDelay = (i%4*0.08)+'s'; });
});
const io = new IntersectionObserver(entries=>{
  entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('is-visible'); io.unobserve(e.target);} });
},{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
