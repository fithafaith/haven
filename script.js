(function(){
'use strict';
const CONFIG = {
  name: "",                   
  note: "I made this for you. There's nothing to finish and nobody keeping score. Come in whenever you need a quiet minute, and leave whenever you like.",
  noteFrom: ".- .-.. .-.. / .-- .. .-.. .-.. / -... . / .- .-.. .-. .. --. .... - / .. -. / - .. -- .",
  helpText: ""                
};

const LEGACY_KEY = 'quietplace:v1', SESSION_KEY = 'quietplace:session';
const blank = name => ({name, moods:[], entries:[], done:[], resets:{}, theme:null, draft:'', cards:{}});
let S = blank(''), KEY = null;
const userKey = name => 'quietplace:u:' + name.trim().toLowerCase();
function save(){ if (!KEY) return; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e) {} }
function loadUser(name){
  let data = null, existing = false;
  try {
    const raw = localStorage.getItem(userKey(name));
    if (raw){ data = JSON.parse(raw); existing = true; }
    else {
      const old = localStorage.getItem(LEGACY_KEY);
      if (old){ data = JSON.parse(old); localStorage.removeItem(LEGACY_KEY); existing = true; }
    }
  } catch(e) {}
  S = Object.assign(blank(name), data || {}); S.name = (data && data.name) || name; KEY = userKey(name); save();
  if (S.theme) document.documentElement.dataset.theme = S.theme; else delete document.documentElement.dataset.theme;
  return existing;
}

const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dk = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
const todayKey = () => dk(new Date());
const root = document.documentElement;
const orb = (cls) => `<div class="orb ${cls||''}" aria-hidden="true"></div>`;
const wait = ms => new Promise(r => setTimeout(r, ms));
function logDone(a){ S.done.push({t:Date.now(), a}); if (S.done.length > 500) S.done = S.done.slice(-500); save(); }
function lastMoodOn(key){ for (let i = S.moods.length - 1; i >= 0; i--) if (dk(new Date(S.moods[i].t)) === key) return S.moods[i]; return null; }
function effectiveDark(){ const t = root.dataset.theme; if (t) return t === 'dark'; return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches; }

const MOODS = [
  {m:1, label:'Drained'}, {m:2, label:'Stressed'}, {m:3, label:'Okay'}, {m:4, label:'Calm'}, {m:5, label:'Good'}
];
const mc = m => `var(--m${m})`;

const TRACKS = [
  {id:'tide', name:'Slow tide', desc:'Waves that rise and fall. Good for a busy mind.'},
  {id:'rain', name:'Soft rain', desc:'Steady rain on a roof, with small drops. Good for tired eyes.'},
  {id:'dusk', name:'Dusk', desc:'Warm, slow chords with the odd soft bell. Good for easing the day out.'},
  {id:'hush', name:'Warm hush', desc:'A low, deep hum. For when you are too tired to think.'}
];

const Sound = (function(){
  let ctx, master, analyser, bufs = {}, ir, cur = null, vol = 0.6, timerMin = 0, tid = 0, fadeId = 0, endAt = 0, raf = 0, lvl = 0;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const api = {on: function(){}};

  function noise(type){
    const len = ctx.sampleRate * 6, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++){
      const d = buf.getChannelData(c);
      if (type === 'white'){ for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; }
      else if (type === 'pink'){
        let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
        for (let i = 0; i < len; i++){
          const w = Math.random() * 2 - 1;
          b0 = .99886*b0 + w*.0555179; b1 = .99332*b1 + w*.0750759; b2 = .969*b2 + w*.153852;
          b3 = .8665*b3 + w*.3104856; b4 = .55*b4 + w*.5329522; b5 = -.7616*b5 - w*.016898;
          d[i] = (b0+b1+b2+b3+b4+b5+b6 + w*.5362) * .11; b6 = w * .115926;
        }
      } else {
        let last = 0;
        for (let i = 0; i < len; i++){ const w = Math.random()*2-1; last = (last + .02*w) / 1.02; d[i] = last * 3.5; }
      }
    }
    return buf;
  }
  function makeIR(sec, decay){
    const len = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++){ const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/len, decay); }
    return buf;
  }
  function ensure(){
    if (!ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { ctx = new AC(); } catch(e) { return false; }
      master = ctx.createGain(); master.gain.value = 0;
      analyser = ctx.createAnalyser(); analyser.fftSize = 256;
      master.connect(analyser); analyser.connect(ctx.destination);
      bufs.pink = noise('pink'); bufs.brown = noise('brown'); bufs.white = noise('white');
      ir = makeIR(3.6, 3);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function kit(){
    let alive = true; const srcs = [], timers = new Set();
    return {
      src(s){ srcs.push(s); if (s.buffer) s.start(0, Math.random() * 4); else s.start(); return s; },
      loop(fn, min, max){
        const run = () => { if (!alive) return; fn(); timers.add(setTimeout(run, min + Math.random() * (max - min))); };
        timers.add(setTimeout(run, min / 2));
      },
      stop(){ alive = false; timers.forEach(clearTimeout); srcs.forEach(s => { try { s.stop(); } catch(e){} }); }
    };
  }
  function nsrc(type){ const s = ctx.createBufferSource(); s.buffer = bufs[type]; s.loop = true; return s; }
  function filt(type, f, q){ const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; }
  function gain(v){ const g = ctx.createGain(); g.gain.value = v; return g; }
  function lfo(freq, depth, param, k){ const o = ctx.createOscillator(); o.frequency.value = freq; const g = gain(depth); o.connect(g); g.connect(param); k.src(o); }
  function osc(type, f, det){ const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; if (det) o.detune.value = det; return o; }

  const scenes = {
    tide(out, k){
      const n = nsrc('pink'), lp = filt('lowpass', 700, .6), sw = gain(.5);
      n.connect(lp); lp.connect(sw); sw.connect(out); k.src(n);
      lfo(.09, 460, lp.frequency, k); lfo(.09, .3, sw.gain, k);
      const b = nsrc('brown'), blp = filt('lowpass', 240), bg = gain(.5);
      b.connect(blp); blp.connect(bg); bg.connect(out); k.src(b);
      lfo(.05, .18, bg.gain, k);
      [73.42, 110].forEach((f, i) => { const o = osc('sine', f), g = gain(.035); o.connect(g); g.connect(out); lfo(.03 + i*.02, .02, g.gain, k); k.src(o); });
    },
    rain(out, k){
      const n = nsrc('pink'), hp = filt('highpass', 600), lp = filt('lowpass', 7000), g = gain(.55);
      n.connect(hp); hp.connect(lp); lp.connect(g); g.connect(out); k.src(n);
      const w = nsrc('white'), bp = filt('bandpass', 3500, .5), wg = gain(.05);
      w.connect(bp); bp.connect(wg); wg.connect(out); k.src(w);
      const b = nsrc('brown'), blp = filt('lowpass', 300), bg = gain(.35);
      b.connect(blp); blp.connect(bg); bg.connect(out); k.src(b);
      lfo(.07, .06, g.gain, k);
      k.loop(() => {
        const t = ctx.currentTime, o = osc('sine', 1700 + Math.random() * 2600), e = gain(0), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(.045, t + .004); e.gain.exponentialRampToValueAtTime(.0001, t + .07);
        o.connect(e); if (p){ p.pan.value = Math.random()*2-1; e.connect(p); p.connect(out); } else e.connect(out);
        o.start(t); o.stop(t + .1);
      }, 100, 650);
    },
    dusk(out, k){
      const verb = ctx.createConvolver(); verb.buffer = ir;
      const wet = gain(.6), dry = gain(.7), bus = gain(1);
      verb.connect(wet); wet.connect(out); dry.connect(out); bus.connect(dry); bus.connect(verb);
      const lp = filt('lowpass', 1100); lp.connect(bus);
      [146.83, 220, 329.63, 369.99, 440].forEach((f, i) => {
        const o = osc(i % 2 ? 'sine' : 'triangle', f, (i % 2 ? -1 : 1) * 5), g = gain(.05);
        o.connect(g); g.connect(lp); lfo(.04 + i*.013, .025, g.gain, k); k.src(o);
      });
      const scale = [587.33, 659.25, 739.99, 880, 987.77, 1174.66];
      k.loop(() => {
        const f = scale[Math.floor(Math.random()*scale.length)], t = ctx.currentTime;
        const o = osc('sine', f), o2 = osc('sine', f * 2.01), e = gain(0), e2 = gain(.22);
        e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(.08, t + .02); e.gain.exponentialRampToValueAtTime(.0001, t + 4.2);
        o.connect(e); o2.connect(e2); e2.connect(e); e.connect(bus);
        o.start(t); o2.start(t); o.stop(t + 4.5); o2.stop(t + 4.5);
      }, 2600, 6800);
    },
    hush(out, k){
      const b = nsrc('brown'), lp = filt('lowpass', 420), g = gain(.9);
      b.connect(lp); lp.connect(g); g.connect(out); k.src(b); lfo(.05, .1, g.gain, k);
      [73.42, 110, 146.83].forEach((f, i) => { const o = osc('sine', f, i * 3), og = gain(.05); o.connect(og); og.connect(out); lfo(.025 + i*.015, .025, og.gain, k); k.src(o); });
    }
  };

  function vizLoop(){
    if (reduce || !analyser) return;
    const a = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(a);
    let s = 0; for (let i = 0; i < a.length; i++){ const d = (a[i] - 128) / 128; s += d*d; }
    const target = cur ? Math.min(1, Math.sqrt(s / a.length) * 4) : 0;
    lvl += (target - lvl) * .08;
    root.style.setProperty('--level', lvl.toFixed(3));
    if (cur || lvl > .01) raf = requestAnimationFrame(vizLoop); else { raf = 0; root.style.setProperty('--level', 0); }
  }
  function volGain(v){ return v * v * .9; }
  function fadeOut(s){ s.out.gain.setTargetAtTime(0, ctx.currentTime, .5); setTimeout(() => { s.k.stop(); try { s.out.disconnect(); } catch(e){} }, 2800); }
  function clearTimer(){ clearTimeout(tid); clearTimeout(fadeId); tid = 0; endAt = 0; }
  function armTimer(){
    clearTimer();
    if (!timerMin || !cur) return;
    endAt = Date.now() + timerMin * 60000;
    tid = setTimeout(() => {
      if (!ctx || !cur) return;
      master.gain.setTargetAtTime(0, ctx.currentTime, 3);
      fadeId = setTimeout(() => api.stop(), 11000);
    }, Math.max(0, timerMin * 60000 - 10000));
  }

  let sfx = null;
  function ensureSfx(){
    if (sfx) return;
    sfx = gain(.8); sfx.connect(ctx.destination);
    const v = ctx.createConvolver(), w = gain(.5); v.buffer = ir;
    sfx.connect(v); v.connect(w); w.connect(ctx.destination);
  }
  api.unlock = ensure;
  api.chime = function(f, vel){
    if (S.sfx === false || !ensure()) return; ensureSfx();
    const t = ctx.currentTime, o = osc('sine', f), o2 = osc('sine', f * 2.01), e = gain(0), e2 = gain(.2);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(.16 * (vel || 1), t + .01); e.gain.exponentialRampToValueAtTime(.0001, t + 1.8);
    o.connect(e); o2.connect(e2); e2.connect(e); e.connect(sfx);
    o.start(t); o2.start(t); o.stop(t + 2); o2.stop(t + 2);
  };
  api.pop = function(f){
    if (S.sfx === false || !ensure()) return; ensureSfx();
    const t = ctx.currentTime, o = osc('sine', f * 1.6), e = gain(0);
    o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f * .7, t + .14);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(.18, t + .006); e.gain.exponentialRampToValueAtTime(.0001, t + .2);
    o.connect(e); e.connect(sfx); o.start(t); o.stop(t + .25);
  };

  api.bomb = function(){
    if (S.sfx === false || !ensure()) return;
    ensureSfx();

    const t = ctx.currentTime;

    const o = osc('triangle', 100);
    const e = gain(10);

    o.frequency.setValueAtTime(100, t);
    o.frequency.exponentialRampToValueAtTime(400, t + 0.3);

    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(0.28, t + 0.015);
    e.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    o.connect(e);
    e.connect(sfx);
    o.start(t);
    o.stop(t + 0.42);

    const n = ctx.createBufferSource();
    const filter = filt('lowpass', 800);
    const ng = gain(0);

    n.buffer = bufs.white;

    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.12, t + 0.008);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    n.connect(filter);
    filter.connect(ng);
    ng.connect(sfx);

    n.start(t);
    n.stop(t + 10);
  };

  api.play = function(id){
    if (!scenes[id] || !ensure()) return false;
    const prev = cur, out = ctx.createGain(); out.gain.value = 0; out.connect(master);
    const k = kit(); scenes[id](out, k);
    const t = ctx.currentTime;
    out.gain.setTargetAtTime(1, t, .8);
    master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(volGain(vol), t, .3);
    if (prev) fadeOut(prev);
    cur = {id, out, k};
    armTimer();
    if (!raf) raf = requestAnimationFrame(vizLoop);
    root.classList.add('playing'); api.on();
    return true;
  };
  api.stop = function(){
    if (cur){ fadeOut(cur); cur = null; }
    clearTimer(); root.classList.remove('playing'); api.on();
  };
  api.toggle = function(id){ if (cur && cur.id === id) api.stop(); else api.play(id); };
  api.id = () => cur ? cur.id : null;
  api.setVolume = function(v){ vol = v; if (ctx && cur) master.gain.setTargetAtTime(volGain(vol), ctx.currentTime, .05); };
  api.volume = () => vol;
  api.setTimer = function(m){ timerMin = m; armTimer(); api.on(); };
  api.timerMin = () => timerMin;
  api.remaining = () => endAt ? Math.max(0, endAt - Date.now()) : 0;
  return api;
})();
let current = 'today';
const views = {};
function show(tab){
  current = tab;
  document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== 'view-' + tab);
  document.querySelectorAll('#nav button').forEach(b => { if (b.dataset.tab === tab) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
  views[tab]();
  window.scrollTo(0, 0);
}

const MOOD_COPY = {
  1:{say:"That sounds like a lot to carry. Let's keep this small.", go:[['Put on Warm hush','music:hush'],['Try one tiny reset','act:resets']]},
  2:{say:"Stress is loud in the body. Slowing your breath is the quickest way to turn it down.", go:[['Breathe slowly for three minutes','act:breathe'],['Write it out, then let it go','write'],['Pop some bubbles','act:bubbles']]},
  3:{say:"Okay is a perfectly good place to be. Want to notice something small that is going right?", go:[['Three good things','act:gratitude'],['Put on some soft music','music:dusk']]},
  4:{say:"Lovely. Let's help it last.", go:[['Put on Dusk','music:dusk'],['Write a few lines about it','write']]},
  5:{say:"Glad to hear it. Let's save a little of this feeling for harder days.", go:[['Three good things','act:gratitude'],['Write it down','write']]}
};
const TAGS = ['Work','Sleep','People','Body','Not sure'];

function renderCheckin(){
  const box = $('#checkin'); if (!box) return;
  const lm = lastMoodOn(todayKey());
  let html = `<h2>How are you arriving?</h2><div class="moods" role="group" aria-label="Your mood">` +
    MOODS.map(o => `<button class="mood" style="--c:${mc(o.m)}" data-act="mood" data-m="${o.m}" aria-pressed="${!!(lm && lm.m === o.m)}"><i></i>${o.label}</button>`).join('') + `</div>`;
  if (lm){
    const c = MOOD_COPY[lm.m];
    html += `<div class="reply"><p class="say">${c.say}</p><div class="go">` +
      c.go.map(g => `<button class="btn" data-act="go" data-go="${g[1]}">${g[0]}</button>`).join('') + `</div>` +
      `<p class="tagline">What's behind it? Pick any, or none.</p><div class="chips" role="group" aria-label="What is behind it">` +
      TAGS.map(t => `<button class="chip" data-act="tag" data-tag="${t}" aria-pressed="${(lm.tags||[]).includes(t)}">${t}</button>`).join('') + `</div></div>`;
  }
  box.innerHTML = html;
}

views.today = function(){
  const hr = new Date().getHours();
  const g = hr < 5 ? "It's late" : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const greet = g + (S.name ? ', ' + esc(S.name) : '') + '.';
  const weekN = S.done.filter(d => Date.now() - d.t < 7 * 864e5).length;
  let week = '';
  for (let i = 6; i >= 0; i--){
    const d = new Date(); d.setDate(d.getDate() - i);
    const lm = lastMoodOn(dk(d));
    week += `<div class="day"><i class="${lm ? 'has' : ''}" ${lm ? `style="--c:${mc(lm.m)}"` : ''} title="${lm ? MOODS[lm.m-1].label : 'No check-in'}"></i>${d.toLocaleDateString(undefined,{weekday:'narrow'})}</div>`;
  }
  $('#view-today').innerHTML = `
    <div class="top split"><button class="quiet" data-act="logout">Not you? Switch name</button><button class="quiet" data-act="theme">${effectiveDark() ? 'Switch to day' : 'Switch to night'}</button></div>
    <div class="hero">
      ${orb()}
      <h1>${greet}</h1>
      <p class="lede">Take a breath. You don't have to fix anything right now.</p>
    </div>
    ${CONFIG.note ? `<blockquote class="note"><p>${esc(CONFIG.note)}</p><footer>${esc(CONFIG.noteFrom)}</footer></blockquote>` : ''}
    <section class="block" id="checkin" aria-live="polite"></section>
    <section class="block" id="cards"></section>
    <section class="block">
      <h2>This week</h2>
      <div class="week" aria-label="Your check-ins this week">${week}</div>
      <p class="fine">${weekN === 0 ? 'Start whenever you like.' : weekN + ' small moment' + (weekN > 1 ? 's' : '') + ' for yourself this week.'}</p>
    </section>
    <section class="help">
      <p>If you ever feel unsafe, hurt, or hopeless just know that you are not alone. I'm here for you. Most especially the all-knowing, all-powerful God to guide you.</p>
      ${CONFIG.helpText ? `<p>${esc(CONFIG.helpText)}</p>` : ''}
    </section>`;
  renderCheckin();
  renderCards();
};

const AFFIRM = [
  "You don't have to earn rest.",
  "Being tired is not a personal failing.",
  "One small thing is still something.",
  "You can be struggling and still be doing your best.",
  "Your feelings make sense, even when they are loud.",
  "Slow is a speed too.",
  "You are allowed to take up space.",
  "Nothing needs to be solved this minute.",
  "It's okay to ask for help. It's okay to need it.",
  "You have gotten through hard days before. This one counts too.",
  "Rest is part of the work.",
  "You are more than what you got done today.",
  "Your worth is not measured in productivity.",
  "It's okay to say no and keep your peace.",
  "Breathe out slowly. You are here, and that is enough for now.",
  "Be as kind to yourself as you would be to a friend.",
  "Not every thought deserves your trust.",
  "Small kindnesses to yourself add up.",
  "You can start again at any hour.",
  "Good enough is good.",
  "It's fine to take the day in pieces.",
  "You don't have to be okay all the time.",
  "The to-do list can wait. You matter more than it does.",
  "Today you only need to do the next gentle thing.",
  "Feelings pass, like weather.",
  "You are allowed to change your plans.",
  "Someone is glad you exist.",
  "Taking care of yourself is not selfish.",
  "You can do hard things, and you can rest between them.",
  "Your body is trying to look after you. Listen kindly.",
  "Progress can be quiet.",
  "Missing a day does not undo your effort. Come back anyway."
];
function dayCards(){
  let h = 0; for (const ch of todayKey()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const idx = [];
  while (idx.length < 3){ h = (h * 1664525 + 1013904223) >>> 0; const i = (h >>> 8) % AFFIRM.length; if (!idx.includes(i)) idx.push(i); }
  return idx;
}
function renderCards(){
  const box = $('#cards'); if (!box) return;
  const idx = dayCards(), pick = (S.cards || {})[todayKey()];
  const cols = [['--m1','--m2'], ['--m4','--m1'], ['--m3','--m5']];
  box.innerHTML = `<h2>A card for today</h2><p class="lede">Three cards, three kind thoughts. Choose whichever one calls to you.</p>
    <div class="cards" role="group" aria-label="Choose a card">${idx.map((a, i) => `<button class="acard" style="--c1:var(${cols[i][0]});--c2:var(${cols[i][1]})" data-act="card" data-slot="${i}" aria-pressed="${pick === i}" aria-label="Card ${i + 1}"><span class="mark" aria-hidden="true"></span></button>`).join('')}</div>
    <p class="cardtext" aria-live="polite">${pick != null ? AFFIRM[idx[pick]] : ''}</p>`;
}

const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';

views.music = function(){
  $('#view-music').innerHTML = `
    <div class="top"></div>
    <h1>Listen</h1>
    <p class="lede">Soft sound, made live on your device. It never repeats the same way twice.</p>
    <div class="player">
      ${orb('sm')}
      <p class="now" id="nowText" aria-live="polite"></p>
      <div class="controls">
        <label class="vol"><span>Volume</span><input id="vol" type="range" min="0" max="100" value="${Math.round(Sound.volume()*100)}" aria-label="Volume"></label>
        <div class="chips" role="group" aria-label="Sleep timer">
          <button class="chip" data-act="timer" data-min="0">No timer</button>
          <button class="chip" data-act="timer" data-min="15">15 min</button>
          <button class="chip" data-act="timer" data-min="30">30 min</button>
          <button class="chip" data-act="timer" data-min="60">60 min</button>
        </div>
        <p class="fine" id="timerText"></p>
      </div>
    </div>
    <ul class="tracks">
      ${TRACKS.map(t => `<li><button class="track" data-act="track" data-id="${t.id}" aria-pressed="false"><span class="t-main"><span class="t-name">${t.name}</span><span class="t-desc">${t.desc}</span></span><span class="t-state" aria-hidden="true">${ICON_PLAY}</span></button></li>`).join('')}
    </ul>
    <p class="fine">No sound on an iPhone? Check that the silent switch is off and the volume is up.</p>`;
  updateMusicUI();
};
function updateMusicUI(){
  const id = Sound.id();
  document.querySelectorAll('.track').forEach(t => {
    const on = t.dataset.id === id;
    t.setAttribute('aria-pressed', on);
    t.querySelector('.t-state').innerHTML = on ? ICON_PAUSE : ICON_PLAY;
  });
  const now = $('#nowText');
  if (now) now.textContent = id ? 'Now playing: ' + TRACKS.find(t => t.id === id).name : 'Choose a sound below. Headphones help.';
  const tt = $('#timerText');
  if (tt){ const r = Sound.remaining(); tt.textContent = r > 0 ? 'Fades out in about ' + Math.max(1, Math.ceil(r / 60000)) + ' min.' : ''; }
  document.querySelectorAll('[data-min]').forEach(c => c.setAttribute('aria-pressed', +c.dataset.min === Sound.timerMin()));
}
Sound.on = updateMusicUI;
setInterval(updateMusicUI, 20000);

const PROMPTS = [
  "What is taking up the most room in your head right now?",
  "What has your body been asking for today?",
  "What went even slightly okay today?",
  "What do you wish someone understood about this week?",
  "What would you say to a friend who felt exactly like this?",
  "What are you carrying that isn't yours to carry?",
  "What do you need right now, in the smallest form?",
  "If tomorrow had nothing you had to do, what would you want it to look like?"
];
let promptIdx = Math.floor(Math.random() * PROMPTS.length), writeTab = 'new', draftTimer = 0;

views.write = function(){
  const n = S.entries.length;
  let body;
  if (writeTab === 'new'){
    body = `
      <p class="prompt" id="promptText">${PROMPTS[promptIdx]}</p>
      <button class="quiet" data-act="newPrompt">Another question</button>
      <textarea id="pageText" placeholder="Start anywhere. It can be messy." aria-label="Your page">${esc(S.draft || '')}</textarea>
      <div class="row">
        <button class="btn primary" data-act="keep">Keep this page</button>
        <button class="btn" data-act="release">Let it go</button>
      </div>
      <p class="status" id="wstatus" role="status" aria-live="polite"></p>
      <p class="fine">Kept pages stay on this device only. Letting go removes the words for good, and they are never saved.</p>`;
  } else if (!n){
    body = `<p class="empty">Nothing here yet. Pages you keep will show up here, only on this device.</p>`;
  } else {
    body = [...S.entries].reverse().map(e => {
      const when = new Date(e.t).toLocaleString(undefined, {weekday:'short', day:'numeric', month:'short', hour:'numeric', minute:'2-digit'});
      return `<article class="page"><div class="meta">${e.m ? `<i style="--c:${mc(e.m)}" title="${MOODS[e.m-1].label}"></i>` : ''}<span>${when}${e.kind === 'gratitude' ? ' · Three good things' : ''}</span></div>${e.prompt ? `<p class="q">${esc(e.prompt)}</p>` : ''}<p class="txt">${esc(e.text)}</p><button class="quiet" data-act="del" data-id="${e.id}">Delete</button></article>`;
    }).join('');
  }
  $('#view-write').innerHTML = `
    <div class="top"></div>
    <h1>Write</h1>
    <p class="lede">Nobody is grading this. Say it messy.</p>
    <div class="seg" role="group" aria-label="Pages">
      <button class="chip" data-act="wtab" data-w="new" aria-pressed="${writeTab === 'new'}">Today's page</button>
      <button class="chip" data-act="wtab" data-w="past" aria-pressed="${writeTab === 'past'}">Past pages${n ? ' (' + n + ')' : ''}</button>
    </div>${body}`;
};
function wstatus(t){ const s = $('#wstatus'); if (s) s.textContent = t; }

const ACT_LIST = [
  {id:'breathe', name:'Slow breathing', desc:'Longer breaths out tell your body it is safe.', min:'3 min'},
  {id:'rest', name:'Five-minute rest', desc:'Close your eyes. Soft sound plays, then fades out on its own.', min:'5 min'},
  {id:'ground', name:'Look around you', desc:'Bring your attention back to the room, one sense at a time.', min:'3 min'},
  {id:'release', name:'Let your body drop', desc:'Tighten and release, one part at a time.', min:'2 min'},
  {id:'gratitude', name:'Three good things', desc:'Tiny, true things from today. They can be very small.', min:'2 min'},
  {id:'resets', name:'Tiny resets', desc:'A short list for when you are running on empty.', min:'1 min'}
];
views.reset = function(){
  $('#view-reset').innerHTML = `
    <div class="top"></div>
    <h1>Reset</h1>
    <p class="lede">Small things that can help. Pick whichever sounds easiest.</p>
    <ul class="acts">${ACT_LIST.map(a => `<li><button class="act" data-act="open" data-id="${a.id}"><span class="a-name">${a.name}</span><span class="a-min">${a.min}</span><span class="a-desc">${a.desc}</span></button></li>`).join('')}</ul>`;
};

const GAME_LIST = [
  {id:'bubbles', name:'Pop bubbles', desc:'Tap or swipe soft bubbles as they drift upward.'},
  {id:'ripples', name:'Ripple chimes', desc:'Touch the water and play soft, gentle notes.'},
  {id:'stars', name:'Connect the stars', desc:'Trace little constellations, one star at a time.'},
  {id:'notes', name:'Play the notes', desc:'Find Do, Re, Mi, Fa, and Sol on a gentle little staff.'},
  {id:'lantern', name:'Release a lantern', desc:'Write a wish or a worry and watch it drift away.'},
  {id:'pairs', name:'Pair up', desc:'A relaxed memory game with no clock.'}
];
views.play = function(){
  const on = S.sfx !== false;
  $('#view-play').innerHTML = `
    <div class="top"></div>
    <h1>Play</h1>
    <p class="lede">Gentle games with no scores, no timers and no way to lose. Stop whenever you like.</p>
    <div class="soundrow"><span>Game sounds</span><button class="chip" data-act="sfx" aria-pressed="${on}">${on ? 'On' : 'Off'}</button></div>
    <ul class="acts">${GAME_LIST.map(a => `<li><button class="act" data-act="open" data-id="${a.id}"><span class="a-name">${a.name}</span><span class="a-min">Any length</span><span class="a-desc">${a.desc}</span></button></li>`).join('')}</ul>`;
};

let sheetCleanup = null, lastFocus = null;
const ACTS = {
  breathe(b){
    const P = [
      {name:'Settle', steps:[['Breathe in',4,1],['Breathe out',6,.55]]},
      {name:'Box', steps:[['Breathe in',4,1],['Hold',4,1],['Breathe out',4,.55],['Rest',4,.55]]},
      {name:'Sleepy', steps:[['Breathe in',4,1],['Hold',7,1],['Breathe out',8,.55]]}
    ];
    let pi = 0, token = 0;
    b.innerHTML = `<h2 id="sheetTitle" class="center">Slow breathing</h2>
      <p class="lede">Pick a rhythm, then follow the circle. Breathe through your nose if you can.</p>
      <div class="chips" style="justify-content:center" role="group" aria-label="Rhythm">${P.map((p,i) => `<button class="chip" data-pat="${i}" aria-pressed="${i===0}">${p.name}</button>`).join('')}</div>
      <div class="orbwrap">${orb('big still')}</div>
      <p class="phase" id="phase" aria-live="polite">Ready when you are</p>
      <p class="count" id="count"></p>
      <div class="row"><button class="btn primary" id="bGo" data-state="idle">Begin</button></div>`;
    const o = $('.orb', b), phase = $('#phase', b), count = $('#count', b), go = $('#bGo', b);
    o.style.transform = 'scale(.55)';
    async function run(){
      const my = ++token; go.textContent = 'Stop'; go.dataset.state = 'run';
      let elapsed = 0; const total = 180;
      o.style.transition = 'none'; o.style.transform = 'scale(.55)'; void o.offsetWidth;
      while (my === token && elapsed < total){
        for (const [label, sec, sc] of P[pi].steps){
          if (my !== token) return;
          phase.textContent = label;
          o.style.transition = 'transform ' + sec + 's ease-in-out'; o.style.transform = 'scale(' + sc + ')';
          for (let s = sec; s > 0; s--){ count.textContent = s; await wait(1000); if (my !== token) return; elapsed++; }
        }
      }
      if (my !== token) return;
      logDone('breathe');
      phase.textContent = 'Nicely done.'; count.textContent = 'Notice your shoulders and jaw. See if they dropped a little.';
      go.textContent = 'Go again'; go.dataset.state = 'idle';
      o.style.transition = 'transform 1.2s ease'; o.style.transform = 'scale(.55)';
    }
    function stop(){
      token++; go.textContent = 'Begin'; go.dataset.state = 'idle'; phase.textContent = 'Ready when you are'; count.textContent = '';
      o.style.transition = 'transform .8s ease'; o.style.transform = 'scale(.55)';
    }
    b.addEventListener('click', e => {
      const c = e.target.closest('[data-pat]');
      if (c){ if (go.dataset.state === 'run') stop(); pi = +c.dataset.pat; b.querySelectorAll('[data-pat]').forEach(x => x.setAttribute('aria-pressed', x === c)); }
      if (e.target.closest('#bGo')){ if (go.dataset.state === 'run') stop(); else run(); }
    });
    return () => { token++; };
  },

  ground(b){
    const STEPS = [
      [5,'things you can see','Look slowly around. Find colours, edges, small details.'],
      [4,'things you can feel','Your feet on the floor, fabric on your skin, the chair holding you.'],
      [3,'things you can hear','Near sounds first, then anything far away.'],
      [2,'things you can smell','Or two smells you like. Imagining them counts.'],
      [1,'thing you can taste','Or take one slow, deep breath.']
    ];
    let i = 0;
    function draw(){
      if (i >= STEPS.length){
        logDone('ground');
        b.innerHTML = `<h2 id="sheetTitle" class="center">Back in the room</h2><p class="lede">You did that. Notice how your body feels compared to a few minutes ago.</p><div class="row"><button class="btn primary" data-act="closeSheet">Done</button></div>`;
        return;
      }
      const [n, what, tip] = STEPS[i];
      b.innerHTML = `<h2 id="sheetTitle" class="center">Look around you</h2><p class="bignum" aria-hidden="true">${n}</p><p class="stepname">${n} ${what}</p><p class="lede">${tip}</p><div class="row"><button class="btn primary" id="gNext">${i === STEPS.length - 1 ? 'Finish' : 'Next'}</button></div>`;
      $('#gNext', b).focus();
      $('#gNext', b).onclick = () => { i++; draw(); };
    }
    draw();
    return () => {};
  },

  release(b){
    const Z = [
      ['Face','Scrunch your forehead and eyes for a few seconds. Then let everything soften. Unclench your jaw.'],
      ['Shoulders','Lift them up toward your ears and hold. Then drop them and let them feel heavy.'],
      ['Arms and hands','Make tight fists and hold. Then open your hands and let your arms go limp.'],
      ['Belly','Pull your belly in gently and hold. Then let it go soft and breathe low.'],
      ['Legs and feet','Press your feet down and tighten your legs. Then let them sink.']
    ];
    let i = -1, timer = 0;
    b.innerHTML = `<h2 id="sheetTitle" class="center">Let your body drop</h2><p class="lede">We'll go through five parts of your body. Tense each one gently, then release. If anything hurts, skip it.</p><div class="row"><button class="btn primary" id="zGo">Begin</button></div>`;
    $('#zGo', b).onclick = step;
    function step(){
      i++;
      if (i >= Z.length){
        logDone('release');
        b.innerHTML = `<h2 id="sheetTitle" class="center">All the way down</h2><p class="lede">Stay here for a breath or two before you move on.</p><div class="row"><button class="btn primary" data-act="closeSheet">Done</button></div>`;
        return;
      }
      b.innerHTML = `<h2 id="sheetTitle" class="center">Let your body drop</h2><p class="stepname">${Z[i][0]}</p><p class="lede">${Z[i][1]}</p><div class="bar" aria-hidden="true"><span id="zBar"></span></div><div class="row"><button class="btn" id="zSkip">${i === Z.length - 1 ? 'Finish' : 'Next'}</button></div>`;
      const bar = $('#zBar', b); bar.style.transition = 'none'; bar.style.width = '0'; void bar.offsetWidth;
      bar.style.transition = 'width 24s linear'; bar.style.width = '100%';
      clearTimeout(timer); timer = setTimeout(step, 24000);
      const sk = $('#zSkip', b); sk.focus(); sk.onclick = () => { clearTimeout(timer); step(); };
    }
    return () => clearTimeout(timer);
  },

  gratitude(b){
    b.innerHTML = `<h2 id="sheetTitle" class="center">Three good things</h2>
      <p class="lede">Anything from today counts: a warm drink, a kind message, a quiet minute.</p>
      <div class="field"><textarea aria-label="First good thing" placeholder="One…"></textarea></div>
      <div class="field"><textarea aria-label="Second good thing" placeholder="Two…"></textarea></div>
      <div class="field"><textarea aria-label="Third good thing" placeholder="Three…"></textarea></div>
      <p class="status" id="gStatus" role="status" aria-live="polite"></p>
      <div class="row"><button class="btn primary" id="gSave">Save these</button></div>`;
    $('#gSave', b).onclick = () => {
      const lines = [...b.querySelectorAll('textarea')].map(t => t.value.trim()).filter(Boolean);
      if (!lines.length){ $('#gStatus', b).textContent = 'Add at least one, however small.'; return; }
      const m = lastMoodOn(todayKey());
      S.entries.push({id:Date.now().toString(36), t:Date.now(), kind:'gratitude', prompt:'', text:lines.map((l,i) => (i+1) + '. ' + l).join('\n'), m:m ? m.m : null});
      logDone('gratitude');
      b.innerHTML = `<h2 id="sheetTitle" class="center">Saved</h2><p class="lede">Good things are easy to miss. You caught some. You'll find them in Past pages.</p><div class="row"><button class="btn primary" data-act="closeSheet">Done</button></div>`;
    };
    return () => {};
  },

  resets(b){
    const ITEMS = ['Drink a glass of water','Open a window, or step outside for two minutes','Roll your shoulders and unclench your jaw','Stretch your arms overhead','Eat something small','Put your phone down for ten minutes','Message someone who feels safe','Wash your face or hands with warm water'];
    const key = todayKey(); let checked = S.resets[key] || [];
    function draw(){
      b.innerHTML = `<h2 id="sheetTitle" class="center">Tiny resets</h2><p class="lede">Pick one. Or two. Nothing here is a task.</p>
        <ul class="checks">${ITEMS.map((t,i) => `<li><label><input type="checkbox" data-i="${i}" ${checked.includes(i) ? 'checked' : ''}><span>${t}</span></label></li>`).join('')}</ul>
        <p class="status" id="rStatus" aria-live="polite">${checked.length ? 'That counts. ' + checked.length + ' of ' + ITEMS.length + ' today.' : ''}</p>`;
      b.querySelectorAll('input').forEach(inp => inp.onchange = () => {
        const i = +inp.dataset.i;
        if (inp.checked && !checked.includes(i)){ checked.push(i); logDone('reset'); }
        else if (!inp.checked){ checked = checked.filter(x => x !== i); }
        S.resets[key] = checked; save();
        $('#rStatus', b).textContent = checked.length ? 'That counts. ' + checked.length + ' of ' + ITEMS.length + ' today.' : '';
      });
    }
    draw();
    return () => {};
  },

  rest(b){
    let started = false, left = 300, iv = 0, prevTimer = 0;
    const fmt = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    b.innerHTML = `<h2 id="sheetTitle" class="center">Five-minute rest</h2>
      <p class="lede">Lie down or lean back and close your eyes. Soft sound plays, then fades out on its own.</p>
      <div class="orbwrap">${orb('big')}</div>
      <p class="phase" id="rText" aria-live="off">5:00</p>
      <p class="count" id="rSub"></p>
      <div class="row"><button class="btn primary" id="rGo">Start resting</button></div>`;
    const txt = $('#rText', b), sub = $('#rSub', b), go = $('#rGo', b);
    go.onclick = () => {
      if (started) return;
      started = true; go.hidden = true; prevTimer = Sound.timerMin();
      Sound.play('hush'); Sound.setTimer(5);
      sub.textContent = 'Let your shoulders drop. You can stop thinking now.';
      iv = setInterval(() => {
        left--; txt.textContent = fmt(Math.max(0, left));
        if (left <= 0){
          clearInterval(iv); started = false; Sound.setTimer(prevTimer); logDone('rest');
          txt.textContent = 'Five minutes done.'; sub.textContent = 'Come back slowly. Stretch before you stand.';
        }
      }, 1000);
    };
    return () => { clearInterval(iv); if (started){ Sound.stop(); Sound.setTimer(prevTimer); } };
  }
};

/* ---------- games ---------- */
const REDUCE = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const gameH = () => Math.max(300, Math.min(Math.round(window.innerHeight * .56), 520));
function makeCanvas(b, h){
  const c = document.createElement('canvas'); c.className = 'gcanvas'; c.style.height = h + 'px';
  b.appendChild(c);
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = c.clientWidth || 320;
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  return {c, g, w, h};
}
function palette(){
  const cs = getComputedStyle(root), v = n => cs.getPropertyValue(n).trim();
  return {m:[1,2,3,4,5].map(i => v('--m' + i)), soft:v('--soft'), ink:v('--ink'), accent:v('--accent')};
}
const canvasPos = (c, e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
const rnd = n => Math.floor(Math.random() * n);

Object.assign(ACTS, {
bubbles(b) {
  b.innerHTML = `
    <h2 id="sheetTitle" class="center">Pop bubbles</h2>
    <p class="lede">
      Pop the colorful bubbles, but watch out for the little bombs.
      Nothing bad happens if you touch one. Just keep playing.
    </p>
    <div class="row" style="justify-content:center;gap:24px;flex-wrap:wrap">
      <p class="fine center" id="bubbleCount">○ 0 bubbles popped</p>
      <p class="fine center" id="bombCount">✦ 0 bombs touched</p>
    </div>
    <p class="status center" id="bubbleMessage"
       role="status" aria-live="polite">Tap a bubble to begin.</p>
  `;

  const { c, g, w, h } = makeCanvas(b, gameH());
  const P = palette();

  c.style.touchAction = 'none';
  c.style.cursor = 'pointer';

  const bubbleCount = $('#bubbleCount', b);
  const bombCount = $('#bombCount', b);
  const message = $('#bubbleMessage', b);

  const scale = [
    261.63, 293.66, 329.63, 392, 440,
    523.25, 587.33, 659.25, 783.99
  ];

  let objects = [];
  let particles = [];
  let raf = 0;
  let last = performance.now();
  let popped = 0;
  let bombsTouched = 0;
  let down = false;
  let logged = false;
  let messageTimer = 0;

  function spawn(initial = false) {
    const isBomb = Math.random() < 0.17;
    const r = isBomb
      ? 17 + Math.random() * 5
      : 18 + Math.random() * 24;

    objects.push({
      type: isBomb ? 'bomb' : 'bubble',
      x: r + Math.random() * Math.max(1, w - 2 * r),
      y: initial
        ? Math.random() * h
        : h + r + 4,
      r,
      vy: (isBomb ? 20 : 14 + Math.random() * 20)
        * (REDUCE ? 0.5 : 1),
      ph: Math.random() * 6.28,
      col: isBomb ? '#5B5267' : P.m[rnd(5)],
      fuse: Math.random() * 6
    });
  }

  for (let i = 0; i < 9; i++) spawn(true);

  const bx = o => o.x + Math.sin(o.ph) * 9;

  function burst(o, color) {
    particles.push({
      x: bx(o),
      y: o.y,
      r: o.r,
      t: 0,
      col: color
    });
  }

  function popBubble(index) {
    const o = objects.splice(index, 1)[0];

    burst(o, o.col);
    popped++;

    bubbleCount.textContent = '○ ' + popped + ' bubbles popped';

    const noteIndex = Math.min(
      scale.length - 1,
      Math.max(
        0,
        Math.floor((1 - (o.r - 18) / 24) * scale.length)
      )
    );

    Sound.pop(scale[noteIndex]);

    if (!logged && popped >= 8) {
      logged = true;
      logDone('game');
    }
  }

  function touchBomb(index) {
    const o = objects.splice(index, 1)[0];

    burst(o, '#A59AAF');
    bombsTouched++;

    bombCount.textContent =
      '✦ ' + bombsTouched + ' bombs touched';

    Sound.bomb();

    message.textContent =
      'A little boom! No worries. Keep floating along.';

    clearTimeout(messageTimer);

    messageTimer = setTimeout(() => {
      if (message.isConnected) {
        message.textContent = 'Find another bubble to pop.';
      }
    }, 1800);
  }

  function hit(px, py) {
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];

      if (Math.hypot(px - bx(o), py - o.y) <= o.r + 8) {
        if (o.type === 'bomb') {
          touchBomb(i);
        } else {
          popBubble(i);
        }

        return;
      }
    }
  }

  function drawBubble(o) {
    const x = bx(o);

    g.globalAlpha = 0.24;
    g.fillStyle = o.col;
    g.beginPath();
    g.arc(x, o.y, o.r, 0, Math.PI * 2);
    g.fill();

    g.globalAlpha = 0.85;
    g.strokeStyle = o.col;
    g.lineWidth = 2;
    g.stroke();

    g.globalAlpha = 0.7;
    g.fillStyle = '#FFFFFF';
    g.beginPath();
    g.arc(
      x - o.r * 0.34,
      o.y - o.r * 0.34,
      o.r * 0.16,
      0,
      Math.PI * 2
    );
    g.fill();
  }

  function drawBomb(o, time) {
    const x = bx(o);
    const bob = Math.sin(time * 2.5 + o.fuse) * 2;

    g.save();
    g.translate(x, o.y + bob);

    // Soft shadow.
    g.globalAlpha = 0.12;
    g.fillStyle = '#292331';
    g.beginPath();
    g.ellipse(2, o.r * 0.8, o.r, 5, 0, 0, Math.PI * 2);
    g.fill();

    // Fuse.
    g.globalAlpha = 1;
    g.strokeStyle = '#9B8D75';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(3, -o.r + 3);
    g.quadraticCurveTo(8, -o.r - 9, 13, -o.r - 7);
    g.stroke();

    // Little glowing fuse tip.
    g.fillStyle = '#F5C878';
    g.beginPath();
    g.arc(13, -o.r - 7, 3, 0, Math.PI * 2);
    g.fill();

    // Bomb body.
    g.fillStyle = '#5B5267';
    g.beginPath();
    g.arc(0, 0, o.r, 0, Math.PI * 2);
    g.fill();

    g.strokeStyle = '#898093';
    g.lineWidth = 1.5;
    g.stroke();

    // Cute highlight.
    g.fillStyle = '#BFB5CC';
    g.beginPath();
    g.arc(-o.r * 0.35, -o.r * 0.35, o.r * 0.18, 0, Math.PI * 2);
    g.fill();

    g.restore();
  }

  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;

    if (objects.length < 16 && Math.random() < dt * 1.7) {
      spawn();
    }

    const time = t / 1000;

    objects.forEach(o => {
      o.y -= o.vy * dt;
      o.ph += dt * 0.8;
    });

    objects = objects.filter(o => o.y > -o.r - 18);

    particles.forEach(p => p.t += dt);
    particles = particles.filter(p => p.t < 0.6);

    g.clearRect(0, 0, w, h);

    objects.forEach(o => {
      if (o.type === 'bomb') {
        drawBomb(o, time);
      } else {
        drawBubble(o);
      }
    });

    particles.forEach(p => {
      const k = p.t / 0.6;

      g.globalAlpha = (1 - k) * 0.8;
      g.strokeStyle = p.col;
      g.lineWidth = 3 * (1 - k) + 0.5;

      g.beginPath();
      g.arc(
        p.x,
        p.y,
        p.r * (1 + k * 0.8),
        0,
        Math.PI * 2
      );
      g.stroke();
    });

    g.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);

  c.addEventListener('pointerdown', e => {
    down = true;
    c.setPointerCapture?.(e.pointerId);

    const [x, y] = canvasPos(c, e);
    hit(x, y);
  });

  c.addEventListener('pointermove', e => {
    if (!down) return;

    const [x, y] = canvasPos(c, e);
    hit(x, y);
  });

  ['pointerup', 'pointerleave', 'pointercancel'].forEach(name => {
    c.addEventListener(name, () => {
      down = false;
    });
  });

  return () => {
    cancelAnimationFrame(raf);
    clearTimeout(messageTimer);
  };
},

  stars(b){
    const SH = [
      {name:'Heart', pts:[[.5,.88],[.26,.62],[.16,.4],[.22,.22],[.38,.16],[.5,.3],[.62,.16],[.78,.22],[.84,.4],[.74,.62]], path:[0,1,2,3,4,5,6,7,8,9,0]},
      {name:'Little boat', pts:[[.14,.6],[.86,.6],[.72,.82],[.28,.82],[.5,.6],[.5,.16],[.78,.5]], path:[0,1,2,3,0,4,5,6,4]},
      {name:'Lantern', pts:[[.5,.1],[.72,.26],[.76,.54],[.62,.76],[.5,.92],[.38,.76],[.24,.54],[.28,.26]], path:[0,1,2,3,4,5,6,7,0]},
      {name:'Mountain', pts:[[.08,.82],[.3,.42],[.44,.62],[.66,.2],[.92,.82]], path:[0,1,2,3,4,0]}
    ];
    const notes = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880, 987.77];
    b.innerHTML = `<h2 id="sheetTitle" class="center">Connect the stars</h2><p class="lede">Tap the glowing star to draw the next line. Take your time.</p>`;
    const {c, g, w, h} = makeCanvas(b, gameH());
    c.style.background = 'linear-gradient(#171B3B,#2A3166)';
    b.insertAdjacentHTML('beforeend', `<p class="stepname" id="sInfo" role="status" aria-live="polite"></p><div class="row"><button class="btn primary" id="sNext" hidden>Next constellation</button></div>`);
    const info = $('#sInfo', b), next = $('#sNext', b);
    const bg = Array.from({length:46}, () => ({x:Math.random() * w, y:Math.random() * h, r:.6 + Math.random() * 1.2, sp:.5 + Math.random() * 1.5, ph:Math.random() * 6}));
    const pad = 44, pos = p => [pad + p[0] * (w - 2 * pad), pad + p[1] * (h - 2 * pad)];
    let si = 0, step = 0, done = false, raf = 0;
    function load(){ step = 0; done = false; next.hidden = true; info.textContent = 'Tap the glowing star.'; }
    load();
    function frame(t){
      const sh = SH[si], time = t / 1000;
      g.clearRect(0, 0, w, h);
      bg.forEach(s => { g.globalAlpha = .3 + .25 * Math.sin(time * s.sp + s.ph); g.fillStyle = '#F5E6EA'; g.beginPath(); g.arc(s.x, s.y, s.r, 0, 6.283); g.fill(); });
      g.globalAlpha = done ? .95 : .75; g.strokeStyle = '#BFE9E2'; g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      for (let k = 0; k < Math.min(step, sh.path.length); k++){ const [x, y] = pos(sh.pts[sh.path[k]]); if (k) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
      const reached = new Set(sh.path.slice(0, step)), target = done ? -1 : sh.path[step];
      sh.pts.forEach((p, i) => {
        const [x, y] = pos(p), on = reached.has(i);
        if (on || i === target){
          g.globalAlpha = (done ? .3 + .12 * Math.sin(time * 2) : .3); g.fillStyle = '#BFE9E2'; g.beginPath(); g.arc(x, y, done ? 22 : 15, 0, 6.283); g.fill();
          g.globalAlpha = 1; g.fillStyle = '#FFF3F0'; g.beginPath(); g.arc(x, y, 5.5, 0, 6.283); g.fill();
        } else {
          g.globalAlpha = .55; g.fillStyle = '#9AA3D6'; g.beginPath(); g.arc(x, y, 3.5, 0, 6.283); g.fill();
        }
        if (i === target){
          g.globalAlpha = .9; g.strokeStyle = '#BFE9E2'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 12 + 5 * Math.sin(time * 3), 0, 6.283); g.stroke();
        }
      });
      g.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    c.addEventListener('pointerdown', e => {
      if (done) return;
      const sh = SH[si], [x, y] = canvasPos(c, e), [tx, ty] = pos(sh.pts[sh.path[step]]);
      if (Math.hypot(x - tx, y - ty) > 40) return;
      Sound.chime(notes[step % notes.length], .9); step++;
      if (step >= sh.path.length){ done = true; info.textContent = sh.name + '. Beautiful.'; next.hidden = false; next.focus(); logDone('game'); }
    });
    next.onclick = () => { si = (si + 1) % SH.length; load(); };
    return () => cancelAnimationFrame(raf);
  },

notes(b) {
  const NOTES = [
    { name: 'E4', sol: 'Mi', freq: 329.63 },
    { name: 'F4', sol: 'Fa', freq: 349.23 },
    { name: 'G4', sol: 'Sol', freq: 392.00 },
    { name: 'A4', sol: 'La', freq: 440.00 },
    { name: 'B4', sol: 'Ti', freq: 493.88 },
    { name: 'C5', sol: 'Do', freq: 523.25 },
    { name: 'D5', sol: 'Re', freq: 587.33 },
    { name: 'E5', sol: 'Mi', freq: 659.25 },
    { name: 'F5', sol: 'Fa', freq: 698.46 },
    { name: 'G5', sol: 'Sol', freq: 783.99 },
    { name: 'A5', sol: 'La', freq: 880.00 },
    { name: 'B5', sol: 'Ti', freq: 987.77 },
    { name: 'C6', sol: 'Do', freq: 1046.50 }
  ];

  b.innerHTML = `
    <h2 id="sheetTitle" class="center">Make a little song</h2>

    <p class="lede center">
      Tap anywhere on the musical staff to place a note.
      Make a melody that sounds like you.
    </p>

    <div style="
      max-width:680px;
      margin:20px auto;
      padding:16px;
      border:1px solid var(--line);
      border-radius:22px;
      background:var(--surface);
    ">
      <div style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        flex-wrap:wrap;
        margin-bottom:12px;
      ">
        <span style="font-weight:600">Your composition</span>
        <span id="songCount" class="fine">0 notes</span>
      </div>

      <canvas
        id="songStaff"
        class="gcanvas"
        aria-label="Musical staff. Tap to place notes."
        style="
          display:block;
          width:100%;
          height:300px;
          background:var(--surface);
          border-radius:12px;
          touch-action:manipulation;
          cursor:crosshair;
        "
      ></canvas>

      <p class="fine center" style="margin:12px 0 0">
        Higher on the staff = higher pitch.
        Each note plays in the order you place it.
      </p>
    </div>

    <div style="
      display:flex;
      justify-content:center;
      flex-wrap:wrap;
      gap:10px;
      margin:18px 0;
    ">
      <button class="btn primary" id="songPlay">▶ Play song</button>
      <button class="btn" id="songStop">■ Stop</button>
      <button class="btn" id="songUndo">↶ Undo note</button>
      <button class="btn" id="songClear">Clear all</button>
    </div>

    <div style="
      max-width:680px;
      margin:18px auto;
      padding:16px;
      border-radius:18px;
      background:var(--surface);
      border:1px solid var(--line);
    ">
      <p style="font-weight:600;margin:0 0 8px">
        Your notes
      </p>

      <p id="songSequence"
         class="lede center"
         style="overflow-wrap:anywhere">
        Your melody will appear here.
      </p>

      <p id="songStatus"
         class="status center"
         role="status"
         aria-live="polite">
        Your song starts with one note.
      </p>
    </div>
  `;

  const canvas = $('#songStaff', b);
  const g = canvas.getContext('2d');
  const count = $('#songCount', b);
  const sequence = $('#songSequence', b);
  const status = $('#songStatus', b);
  const playBtn = $('#songPlay', b);
  const stopBtn = $('#songStop', b);
  const undoBtn = $('#songUndo', b);
  const clearBtn = $('#songClear', b);

  let song = [];
  let timers = [];
  let playing = false;
  let playToken = 0;
  let activeIndex = -1;
  let width = 320;
  let height = 300;
  let dpr = 1;

  const lineGap = 18;
  const topLine = 90;
  const bottomLine = topLine + lineGap * 4;
  const stepHeight = lineGap / 2;

  const P = palette();

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();

    width = rect.width || 320;
    height = 300;
    dpr = Math.min(2, window.devicePixelRatio || 1);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    draw();
  }

  function noteAtY(y) {
    const step = Math.max(
      0,
      Math.min(
        NOTES.length - 1,
        Math.round((bottomLine - y) / stepHeight)
      )
    );

    return NOTES[step];
  }

  function positionY(note) {
    const index = NOTES.findIndex(n => n.name === note.name);
    return bottomLine - index * stepHeight;
  }

  function drawNote(x, y, note, active) {
    g.save();

    // Ledger lines for notes outside the staff.
    if (y < topLine || y > bottomLine) {
      g.strokeStyle = P.ink;
      g.lineWidth = 1;

      const ledgerY = y < topLine
        ? Math.ceil((topLine - y) / lineGap)
        : Math.ceil((y - bottomLine) / lineGap);

      for (let i = 1; i <= ledgerY; i++) {
        const ly = y < topLine
          ? topLine - i * lineGap
          : bottomLine + i * lineGap;

        if (
          (y < topLine && ly >= y - 1) ||
          (y > bottomLine && ly <= y + 1)
        ) {
          g.beginPath();
          g.moveTo(x - 12, ly);
          g.lineTo(x + 12, ly);
          g.stroke();
        }
      }
    }

    // Note head.
    g.translate(x, y);
    g.rotate(-0.28);

    g.fillStyle = active ? P.accent : P.m[3];
    g.beginPath();
    g.ellipse(0, 0, 8, 5.5, 0, 0, Math.PI * 2);
    g.fill();

    g.restore();

    // Stem.
    g.strokeStyle = active ? P.accent : P.ink;
    g.lineWidth = 1.7;

    g.beginPath();
    g.moveTo(x + 7, y);
    g.lineTo(x + 7, y - 31);
    g.stroke();

    // Pitch label.
    g.fillStyle = P.ink;
    g.globalAlpha = 0.8;
    g.textAlign = 'center';
    g.font = '11px sans-serif';
    g.fillText(note.name, x, y + 20);
    g.globalAlpha = 1;
  }

  function draw() {
    g.clearRect(0, 0, width, height);

    // Five-line treble staff.
    g.strokeStyle = P.ink;
    g.globalAlpha = 0.48;
    g.lineWidth = 1;

    for (let i = 0; i < 5; i++) {
      const y = topLine + i * lineGap;

      g.beginPath();
      g.moveTo(18, y);
      g.lineTo(width - 18, y);
      g.stroke();
    }

    g.globalAlpha = 1;

    // Treble clef.
    g.fillStyle = P.m[3];
    g.font = '54px serif';
    g.textAlign = 'left';
    g.fillText('𝄞', 18, bottomLine + 9);

    // Draw the user's notes in their placement order.
    const left = 76;
    const right = width - 28;
    const available = Math.max(20, right - left);

    song.forEach((item, index) => {
      const x = song.length === 1
        ? width / 2
        : left + (index / Math.max(1, song.length - 1)) * available;

      const y = positionY(item.note);

      if (index === activeIndex) {
        g.globalAlpha = 0.18;
        g.fillStyle = P.accent;
        g.beginPath();
        g.arc(x, y, 16, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }

      drawNote(x, y, item.note, index === activeIndex);
    });

    // Empty-state hint.
    if (!song.length) {
      g.fillStyle = P.soft;
      g.globalAlpha = 0.9;
      g.textAlign = 'center';
      g.font = 'italic 15px serif';
      g.fillText('Place your first note here', width / 2, 225);
      g.globalAlpha = 1;
    }

    count.textContent = song.length +
      (song.length === 1 ? ' note' : ' notes');

    sequence.textContent = song.length
      ? song.map(item => item.note.name).join(' · ')
      : 'Your melody will appear here.';

    undoBtn.disabled = !song.length;
    clearBtn.disabled = !song.length;
    playBtn.disabled = !song.length || playing;
    stopBtn.disabled = !playing;
  }

  function stopSong() {
    playToken++;
    playing = false;
    activeIndex = -1;

    timers.forEach(clearTimeout);
    timers = [];

    draw();
  }

  function placeNote(e) {
    if (playing) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x < 8 || x > width - 8) return;
    if (y < 24 || y > height - 20) return;

    const note = noteAtY(y);

    // Keep the melody readable on the staff.
    if (song.length >= 32) {
      status.textContent =
        'Your song has 32 notes. Play it or clear it to start again.';
      return;
    }

    song.push({
      note,
      x,
      t: Date.now()
    });

    Sound.chime(note.freq, 0.75);

    status.textContent =
      note.sol + ' (' + note.name + ') added to your song.';

    draw();
  }

  async function playSong() {
    if (!song.length || playing) return;

    playing = true;
    const token = ++playToken;

    draw();
    status.textContent = 'Listen to your little melody.';

    for (let i = 0; i < song.length; i++) {
      if (token !== playToken) return;

      activeIndex = i;
      draw();

      Sound.chime(song[i].note.freq, 0.8);

      await new Promise(resolve => {
        const timer = setTimeout(resolve, 480);
        timers.push(timer);
      });

      if (token !== playToken) return;
    }

    playing = false;
    activeIndex = -1;

    timers = [];

    draw();
    status.textContent = 'Your song is complete. Make another?';

    logDone('game');
  }

  canvas.addEventListener('pointerdown', placeNote);

  playBtn.addEventListener('click', playSong);
  stopBtn.addEventListener('click', stopSong);

  undoBtn.addEventListener('click', () => {
    if (playing) stopSong();
    if (!song.length) return;

    song.pop();
    status.textContent = 'Last note removed.';
    draw();
  });

  clearBtn.addEventListener('click', () => {
    stopSong();
    song = [];

    status.textContent =
      'A fresh staff. Start a new melody whenever you like.';

    draw();
  });

  // Redraw if the sheet changes width.
  let resizeObserver = null;

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas);
  } else {
    window.addEventListener('resize', resizeCanvas);
  }

  resizeCanvas();

  return () => {
    stopSong();

    if (resizeObserver) {
      resizeObserver.disconnect();
    } else {
      window.removeEventListener('resize', resizeCanvas);
    }
  };
},

  lantern(b){
    b.innerHTML = `<h2 id="sheetTitle" class="center">Release a lantern</h2><p class="lede">Write a wish, or something you want to let go of. Then watch it drift away. It isn't saved anywhere.</p>`;
    const {c, g, w, h} = makeCanvas(b, gameH());
    c.style.background = 'linear-gradient(#171B3B,#2A3166)'; c.style.cursor = 'default';
    b.insertAdjacentHTML('beforeend', `<div class="wishrow"><input id="wish" maxlength="48" placeholder="I wish for… or I let go of…" aria-label="Your wish"><button class="btn primary" id="wishGo">Release</button></div><p class="status center" id="wishMsg" role="status" aria-live="polite"></p>`);
    const inp = $('#wish', b), msg = $('#wishMsg', b);
    const bg = Array.from({length:50}, () => ({x:Math.random() * w, y:Math.random() * h, r:.6 + Math.random() * 1.2, sp:.5 + Math.random() * 1.5, ph:Math.random() * 6}));
    let lans = [], raf = 0, last = performance.now(), ever = false, logged = false;
    function release(){
      const t = inp.value.trim();
      if (!t){ msg.textContent = 'Write a few words first. Even one is enough.'; return; }
      lans.push({x:w * (.3 + Math.random() * .4), t:0, dur:REDUCE ? 24 : 19, text:t, ph:Math.random() * 6, drift:(Math.random() - .5) * 60});
      ever = true; inp.value = ''; msg.textContent = 'Released. Watch it go.';
      Sound.chime(261.63, .7); setTimeout(() => Sound.chime(392, .5), 420);
      if (!logged){ logged = true; logDone('game'); }
    }
    function frame(tm){
      const dt = Math.min(.05, (tm - last) / 1000); last = tm; const time = tm / 1000;
      g.clearRect(0, 0, w, h);
      bg.forEach(s => { g.globalAlpha = .3 + .25 * Math.sin(time * s.sp + s.ph); g.fillStyle = '#F5E6EA'; g.beginPath(); g.arc(s.x, s.y, s.r, 0, 6.283); g.fill(); });
      lans.forEach(o => o.t += dt); lans = lans.filter(o => o.t < o.dur);
      lans.forEach(o => {
        const p = o.t / o.dur, e = p * p * (3 - 2 * p), y0 = h - 60;
        const x = o.x + o.drift * e + Math.sin(o.t * .7 + o.ph) * 9, y = y0 - (y0 + 90) * e, sc = 1 - .55 * e;
        const al = p < .8 ? 1 : 1 - (p - .8) / .2;
        g.save(); g.translate(x, y); g.scale(sc, sc);
        const gr = g.createRadialGradient(0, 0, 4, 0, 0, 72);
        gr.addColorStop(0, 'rgba(255,205,125,.55)'); gr.addColorStop(1, 'rgba(255,205,125,0)');
        g.globalAlpha = al * (.88 + .12 * Math.sin(time * 9 + o.ph)); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 72, 0, 6.283); g.fill();
        const bd = g.createLinearGradient(0, -30, 0, 24); bd.addColorStop(0, '#FFE9BE'); bd.addColorStop(1, '#F2A765');
        g.globalAlpha = al * .96; g.fillStyle = bd;
        g.beginPath(); g.moveTo(-16, -24); g.quadraticCurveTo(0, -36, 16, -24); g.lineTo(24, 22); g.lineTo(-24, 22); g.closePath(); g.fill();
        g.globalAlpha = al; g.fillStyle = '#FFF6D8'; g.beginPath(); g.ellipse(0, 12, 5, 7, 0, 0, 6.283); g.fill();
        g.restore();
        let fs = 16; g.font = 'italic 300 ' + fs + 'px Newsreader, Georgia, serif';
        while (fs > 10 && g.measureText(o.text).width > w - 28){ fs--; g.font = 'italic 300 ' + fs + 'px Newsreader, Georgia, serif'; }
        g.globalAlpha = al * (1 - .5 * e); g.fillStyle = '#F5E6EA'; g.textAlign = 'center';
        g.fillText(o.text, Math.min(w - 14 - g.measureText(o.text).width / 2, Math.max(14 + g.measureText(o.text).width / 2, x)), y + 52 * sc + 10);
      });
      if (!ever){ g.globalAlpha = .7; g.fillStyle = '#F5E6EA'; g.textAlign = 'center'; g.font = 'italic 300 24px Newsreader, Georgia, serif'; g.fillText('Your lantern will rise here', w / 2, h / 2); }
      g.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    $('#wishGo', b).onclick = release;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') release(); });
    return () => cancelAnimationFrame(raf);
  },

  pairs(b){
    const SHAPES = [
      ['Circle','<circle cx="20" cy="20" r="13"/>','var(--m1)'],
      ['Triangle','<path d="M20 8 33 31H7z"/>','var(--m2)'],
      ['Square','<rect x="9" y="9" width="22" height="22" rx="4"/>','var(--m3)'],
      ['Moon','<path d="M26 8a13 13 0 1 0 6 20 11 11 0 0 1-6-20z"/>','var(--m5)'],
      ['Leaf','<path d="M8 32C8 17 17 8 32 8c0 15-8 24-24 24z"/>','var(--m4)'],
      ['Drop','<path d="M20 7C27 16 31 21 31 26a11 11 0 0 1-22 0c0-5 4-10 11-19z"/>','var(--accent)']
    ];
    const notes = [261.63, 329.63, 392, 440, 523.25, 659.25];
    b.innerHTML = `<h2 id="sheetTitle" class="center">Pair up</h2><p class="lede">Turn two cards at a time and find the matches. No timer, no move count.</p>
      <div class="grid" id="pGrid"></div><p class="status center" id="pMsg" role="status" aria-live="polite"></p>
      <div class="row"><button class="btn" id="pAgain">Shuffle again</button></div>`;
    const grid = $('#pGrid', b), msg = $('#pMsg', b);
    let deck = [], open = [], lock = false, matched = 0; const timers = [];
    function deal(){
      timers.forEach(clearTimeout); timers.length = 0;
      deck = []; SHAPES.forEach((s, i) => { deck.push(i, i); });
      for (let i = deck.length - 1; i > 0; i--){ const j = rnd(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      open = []; lock = false; matched = 0; msg.textContent = '';
      grid.innerHTML = deck.map((d, i) => `<button class="pcard" data-i="${i}" aria-label="Card ${i + 1}, face down"><span class="face"><svg viewBox="0 0 40 40" fill="${SHAPES[d][2]}" aria-hidden="true">${SHAPES[d][1]}</svg></span></button>`).join('');
    }
    deal();
    grid.addEventListener('click', e => {
      const card = e.target.closest('.pcard'); if (!card || lock) return;
      if (card.classList.contains('up')) return;
      const i = +card.dataset.i, d = deck[i];
      card.classList.add('up'); card.setAttribute('aria-label', 'Card ' + (i + 1) + ', ' + SHAPES[d][0]);
      Sound.chime(notes[d], .6);
      open.push(card);
      if (open.length < 2) return;
      const [a, c2] = open, da = deck[+a.dataset.i], dc = deck[+c2.dataset.i];
      if (da === dc){
        a.classList.add('ok'); c2.classList.add('ok'); open = []; matched++;
        timers.push(setTimeout(() => Sound.chime(notes[da] * 1.5, .9), 180));
        if (matched === SHAPES.length){ msg.textContent = 'All paired. Nice and slow.'; logDone('game'); }
      } else {
        lock = true;
        timers.push(setTimeout(() => {
          [a, c2].forEach(x => { x.classList.remove('up'); x.setAttribute('aria-label', 'Card ' + (+x.dataset.i + 1) + ', face down'); });
          open = []; lock = false;
        }, 950));
      }
    });
    $('#pAgain', b).onclick = deal;
    return () => timers.forEach(clearTimeout);
  }
});

function openActivity(id){
  if (!ACTS[id]) return;
  closeSheet(true);
  lastFocus = document.activeElement;
  const body = document.createElement('div');
  $('#sheetBody').innerHTML = ''; $('#sheetBody').appendChild(body);
  Sound.unlock();
  $('#sheet').hidden = false; $('#sheet').scrollTop = 0;
  sheetCleanup = ACTS[id](body);
  document.body.style.overflow = 'hidden';
  if (!body.querySelector('button:focus')) $('#sheetClose').focus();
}
function closeSheet(silent){
  if (sheetCleanup){ try { sheetCleanup(); } catch(e){} sheetCleanup = null; }
  const sh = $('#sheet'); if (sh.hidden) return;
  sh.hidden = true; $('#sheetBody').innerHTML = ''; document.body.style.overflow = '';
  if (!silent){ if (lastFocus && lastFocus.focus) lastFocus.focus(); if (current === 'write') views.write(); if (current === 'today') views.today(); }
}

/* ------------------------------------------------------------------
   Events
-------------------------------------------------------------------*/
function go(target){
  const [kind, id] = target.split(':');
  if (kind === 'music'){ show('music'); Sound.play(id); }
  else if (kind === 'act'){ openActivity(id); }
  else if (kind === 'write'){ writeTab = 'new'; show('write'); }
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act;
  switch (a){
    case 'tab': closeSheet(true); show(el.dataset.tab); break;
    case 'theme': { const next = effectiveDark() ? 'light' : 'dark'; root.dataset.theme = next; S.theme = next; save(); views.today(); break; }
    case 'gateGo': submitGate(); break;
    case 'logout': {
      Sound.stop(); closeSheet(true); clearTimeout(draftTimer);
      try { localStorage.removeItem(SESSION_KEY); } catch(e) {}
      S = blank(''); KEY = null; delete root.dataset.theme;
      document.querySelectorAll('.view').forEach(v => { v.innerHTML = ''; });
      showGate(); break;
    }
    case 'card': {
      S.cards = {[todayKey()]: +el.dataset.slot}; save(); renderCards();
      const nb = $('.acard[aria-pressed="true"]'); if (nb) nb.focus(); break;
    }
    case 'mood': {
      const m = +el.dataset.m, now = Date.now(), lm = lastMoodOn(todayKey());
      if (lm && now - lm.t < 5 * 60000){ lm.m = m; lm.t = now; } else S.moods.push({t:now, m, tags:[]});
      if (S.moods.length > 400) S.moods = S.moods.slice(-400);
      save(); renderCheckin(); break;
    }
    case 'tag': {
      const lm = lastMoodOn(todayKey()); if (!lm) break; lm.tags = lm.tags || [];
      const t = el.dataset.tag, i = lm.tags.indexOf(t); if (i > -1) lm.tags.splice(i, 1); else lm.tags.push(t);
      save(); renderCheckin(); break;
    }
    case 'go': go(el.dataset.go); break;
    case 'track': Sound.toggle(el.dataset.id); break;
    case 'timer': Sound.setTimer(+el.dataset.min); break;
    case 'wtab': writeTab = el.dataset.w; views.write(); break;
    case 'newPrompt': { let n; do { n = Math.floor(Math.random() * PROMPTS.length); } while (n === promptIdx && PROMPTS.length > 1); promptIdx = n; $('#promptText').textContent = PROMPTS[n]; break; }
    case 'keep': {
      const ta = $('#pageText'), text = ta.value.trim();
      if (!text){ wstatus('Write a few words first. Even one is enough.'); break; }
      const m = lastMoodOn(todayKey());
      S.entries.push({id:Date.now().toString(36), t:Date.now(), kind:'page', prompt:PROMPTS[promptIdx], text, m:m ? m.m : null});
      S.draft = ''; logDone('write'); save(); ta.value = '';
      wstatus('Kept. Thank you for putting that into words.'); break;
    }
    case 'release': {
      const ta = $('#pageText'), text = ta.value.trim();
      if (!text){ wstatus('Write a few words first, then let them go.'); break; }
      ta.classList.add('releasing'); ta.disabled = true; wstatus('Letting go…');
      setTimeout(() => {
        S.draft = ''; logDone('release'); save();
        const t2 = $('#pageText'); if (!t2) return;
        t2.value = ''; t2.classList.remove('releasing'); t2.disabled = false;
        wstatus('Let go. Those words are not saved anywhere. Take a slow breath out.');
      }, 2600);
      break;
    }
    case 'del': {
      if (el.dataset.armed){ S.entries = S.entries.filter(x => x.id !== el.dataset.id); save(); views.write(); }
      else { el.dataset.armed = '1'; el.textContent = 'Tap again to delete'; setTimeout(() => { if (el.isConnected){ delete el.dataset.armed; el.textContent = 'Delete'; } }, 3000); }
      break;
    }
    case 'sfx': S.sfx = (S.sfx === false); save(); views.play(); break;
    case 'open': openActivity(el.dataset.id); break;
    case 'closeSheet': closeSheet(); break;
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'vol') Sound.setVolume(e.target.value / 100);
  if (e.target.id === 'pageText'){ clearTimeout(draftTimer); const v = e.target.value; draftTimer = setTimeout(() => { S.draft = v; save(); }, 400); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
  if (e.key === 'Enter' && e.target.id === 'gateName') submitGate();
});

/* ------------------------------------------------------------------
   Welcome screen (name entry) and greeting
-------------------------------------------------------------------*/
const gate = $('#gate');
function showGate(){
  gate.hidden = false; gate.style.opacity = '1'; document.body.style.overflow = 'hidden';
  gate.innerHTML = `<div class="gate-in">${orb('sm')}
    <h1 id="gateTitle">Welcome.</h1>
    <p class="lede">This is a quiet place, just for you. What should I call you?</p>
    <div class="nameask"><input id="gateName" maxlength="30" placeholder="Your name" aria-label="Your name" autocomplete="given-name" value="${esc(CONFIG.name)}"><button class="btn primary" data-act="gateGo">Come in</button></div>
    <p class="status" id="gateMsg" role="status" aria-live="polite"></p>
    <p class="fine">Your name and everything you write stay on this device.</p></div>`;
  $('#gateName').focus();
}
function submitGate(){
  const inp = $('#gateName'); if (!inp) return;
  const v = inp.value.trim().replace(/\s+/g, ' ').slice(0, 30);
  if (!v){ $('#gateMsg').textContent = 'Please type a name to come in.'; inp.focus(); return; }
  const existing = loadUser(v);
  try { localStorage.setItem(SESSION_KEY, S.name); } catch(e) {}
  show('today');
  gate.innerHTML = `<div class="gate-in">${orb('sm')}
    <h1 id="gateTitle">${existing ? 'Welcome back' : 'Hello'}, ${esc(S.name)}.</h1>
    <p class="lede">${existing ? "It's good to see you again. Take your time." : "I'm so glad you're here. Take your time."}</p></div>`;
  setTimeout(() => {
    gate.style.opacity = '0';
    setTimeout(() => { gate.hidden = true; gate.innerHTML = ''; document.body.style.overflow = ''; window.scrollTo(0, 0); }, 650);
  }, 2400);
}

let sess = null;
try { sess = localStorage.getItem(SESSION_KEY); } catch(e) {}
if (sess){ loadUser(sess); show('today'); } else showGate();
})();