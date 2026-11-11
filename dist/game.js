(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d', { alpha: false });
  const bg = new Image(), lady = new Image();
  const gardenCache = document.createElement('canvas'), ladyCache = document.createElement('canvas');
  let W = 1440, H = 810, dpr = 1, state = 'intro', previousState = 'intro';
  let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, sound = false;
  let clock = 90, elapsed = 0, score = 0, combo = 0, maxCombo = 0, comboTime = 0;
  let flowerCount = 0, butterflyCount = 0, chapter = 0, spawnClock = 0, flowerClock = 0;
  let gameTime = 0, lastTime = 0, uiClock = 0, announcementClock = 0, bloomRing = 0;
  let flowers = [], enemies = [], particles = [], floating = [], traces = [], blooms = [];
  let keys = new Set(), ready = false, best = 0, ambientClock = 0;
  let audio = null, master = null, melodyStep = 0, melodyClock = 0;
  let p = { x: 600, y: 630, face: 1, hp: 5, energy: 0, atk: 0, atkCD: 0, dash: 0, dashCD: 0, dx: 1, dy: 0, hurt: 0, step: 0 };
  const chapters = [
    ['第一折 · 春初醒', '花间试扇', '采花蓄意，挥扇化蝶'],
    ['第二折 · 蝶成阵', '蝶起香径', '墨蝶渐密，留意近身前的朱色圆环'],
    ['第三折 · 春正浓', '一庭盛放', '花意满时，按 L 让百花齐放']
  ];
  try { best = Number(localStorage.getItem('zanhua-best') || 0); } catch (_) {}
  if (best) $('best-intro').textContent = `曾留春色 ${best} · 等你再续`;
  $('motion').setAttribute('aria-pressed', String(reduced));
  document.body.classList.toggle('reduced', reduced);

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const distance = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * 1.1);
  const minY = () => W < 900 ? 340 : 430;
  const maxY = () => H - 105;
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    W = H * r.width / r.height;
    dpr = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (ready) cacheArt();
    p.x = clamp(p.x, 65, W - 65); p.y = clamp(p.y, minY(), maxY());
    flowers.forEach(f => { f.x = clamp(f.x, 60, W - 60); });
  }
  function cacheArt() {
    gardenCache.width = canvas.width; gardenCache.height = canvas.height;
    const c = gardenCache.getContext('2d', { alpha: false }); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#ead7b5'; c.fillRect(0, 0, W, H);
    const scale = Math.max(W / bg.naturalWidth, H / bg.naturalHeight), iw = bg.naturalWidth * scale, ih = bg.naturalHeight * scale;
    c.drawImage(bg, (W - iw) * (W < 900 ? .72 : .5), (H - ih) * .5, iw, ih);
    c.fillStyle = 'rgba(248,240,221,.32)'; c.fillRect(0, 0, W, H);
    ladyCache.height = Math.ceil(215 * dpr); ladyCache.width = Math.ceil(ladyCache.height * lady.naturalWidth / lady.naturalHeight);
    ladyCache.getContext('2d').drawImage(lady, 0, 0, ladyCache.width, ladyCache.height);
  }
  new ResizeObserver(resize).observe($('frame'));

  function load(img, src) { return new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = src; }); }
  Promise.all([load(bg, 'assets/garden.png'), load(lady, 'assets/lady.png')]).then(() => {
    ready = true; $('loading').hidden = true; resize();
  }).catch(() => { $('loading').classList.add('error'); $('loading').textContent = '画卷暂未展开，请刷新页面重试。'; });

  // Entire soundscape is synthesized locally: a pentatonic plucked-string voice.
  function initAudio() {
    if (!audio) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audio = new Audio(); master = audio.createGain(); master.gain.value = 0.26; master.connect(audio.destination);
    }
    if (audio.state === 'suspended') audio.resume().catch(() => {});
  }
  function note(freq, duration = .7, volume = .15, delay = 0) {
    if (!sound || !audio || !master) return;
    const t = audio.currentTime + delay;
    [1, 2, 3].forEach((harmonic, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = freq * harmonic;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(volume / (1 + i * 3), t + .007);
      g.gain.exponentialRampToValueAtTime(.0001, t + duration / (1 + i * .4));
      o.connect(g); g.connect(master); o.start(t); o.stop(t + duration + .03);
    });
  }
  function sfx(kind) {
    if (kind === 'flower') note([523.25, 587.33, 659.25, 783.99, 880][combo % 5], .55, .22);
    if (kind === 'attack') { note(196, .16, .09); note(392, .25, .06, .03); }
    if (kind === 'kill') { note(783.99, .45, .18); note(1046.5, .55, .12, .07); }
    if (kind === 'dash') { note(293.66, .23, .10); note(440, .3, .08, .05); }
    if (kind === 'hurt') { note(146.83, .3, .18); note(155.56, .27, .08); }
    if (kind === 'bloom') [261.63, 329.63, 392, 523.25, 659.25, 783.99, 1046.5].forEach((n, i) => note(n, 1.6, .16, i * .09));
  }
  $('sound').onclick = () => { sound = !sound; if (sound) { initAudio(); note(523.25); } $('sound').setAttribute('aria-pressed', String(sound)); $('sound').querySelector('span').textContent = sound ? '声音开' : '声音关'; };
  $('motion').onclick = () => { reduced = !reduced; $('motion').setAttribute('aria-pressed', String(reduced)); document.body.classList.toggle('reduced', reduced); if (reduced) { particles = particles.slice(-18); traces = []; } };

  function announce(text, time = 2.6) { $('announcement').textContent = text; $('announcement').classList.add('show'); announcementClock = time; }
  function syncHUD() {
    $('score').textContent = String(score).padStart(4, '0');
    $('clock').textContent = Math.max(0, Math.ceil(clock));
    $('life').innerHTML = Array.from({ length: 5 }, (_, i) => `<span class="${i >= p.hp ? 'lost' : ''}" aria-hidden="true">✿</span>`).join('');
    $('life').setAttribute('aria-label', `花容 ${p.hp} / 5`);
    $('energy-fill').style.width = p.energy + '%'; $('energy-label').textContent = `${Math.floor(p.energy)} / 100`;
    $('bloom').disabled = p.energy < 100;
    $('combo').hidden = combo < 3; $('combo-count').textContent = combo;
  }
  function updateChapter(force = false) {
    const c = clock > 60 ? 0 : clock > 30 ? 1 : 2;
    if (c === chapter && !force) return;
    if (c !== chapter) { chapter = c; p.hp = Math.min(5, p.hp + 1); announce(chapters[c][1] + ' · 花容回复'); sfx('flower'); }
    $('chapter-kicker').textContent = chapters[c][0]; $('chapter-title').textContent = chapters[c][1]; $('objective').textContent = chapters[c][2];
  }
  function start() {
    if (!ready) return;
    state = 'playing'; clock = 90; elapsed = 0; score = 0; combo = 0; maxCombo = 0; comboTime = 0; chapter = 0;
    flowerCount = 0; butterflyCount = 0; spawnClock = 1.7; flowerClock = .7; bloomRing = 0; uiClock = 0;
    flowers = []; enemies = []; particles = []; floating = []; traces = []; blooms = []; keys.clear();
    p = { x: W * .46, y: H * .73, face: 1, hp: 5, energy: 0, atk: 0, atkCD: 0, dash: 0, dashCD: 0, dx: 1, dy: 0, hurt: 0, step: 0 };
    ['intro', 'pause-layer', 'result-layer', 'help-layer'].forEach(id => $(id).hidden = true);
    $('hud').hidden = false; $('game-bottom').hidden = false;
    for (let i = 0; i < 5; i++) spawnFlower(W * (.2 + i * .14), rand(minY() + 35, maxY() - 15));
    updateChapter(true); syncHUD(); canvas.focus({ preventScroll: true });
    announce('拾落花，挥团扇。春光正好。', 3.5);
    if (sound) initAudio();
  }
  function end(win) {
    state = 'ended'; keys.clear(); $('result-layer').hidden = false; $('combo').hidden = true; $('announcement').classList.remove('show');
    $('result-kicker').textContent = win ? '春 色 满 园' : '春 光 待 续';
    $('result-title').textContent = win ? (score >= 1600 ? '一庭花事，皆入簪间。' : '春风过处，自有花开。') : '且收团扇，来日再约。';
    $('result-desc').textContent = win ? '你走过三折春光，把花香留在了画里。' : '墨蝶扰了花事。再试着用闪身避开朱色圆环。';
    $('final-score').textContent = score; $('final-flowers').textContent = flowerCount; $('final-butterflies').textContent = butterflyCount; $('final-combo').textContent = maxCombo;
    const isBest = score > best; best = Math.max(best, score);
    try { localStorage.setItem('zanhua-best', String(best)); } catch (_) {}
    $('best-result').textContent = isBest ? `新添一笔春色 · 最佳 ${best}` : `留在画中的最佳春色 · ${best}`;
    $('again').focus({ preventScroll: true }); if (win) sfx('bloom');
  }
  function pause() { if (state !== 'playing') return; state = 'paused'; keys.clear(); $('pause-layer').hidden = false; $('resume').focus({ preventScroll: true }); }
  function resume() { if (state !== 'paused') return; state = 'playing'; $('pause-layer').hidden = true; canvas.focus({ preventScroll: true }); }
  function showHelp() { previousState = state; if (state === 'playing') { state = 'help'; keys.clear(); } $('help-layer').hidden = false; $('close-help').focus({ preventScroll: true }); }
  function closeHelp() { $('help-layer').hidden = true; if (state === 'help') state = previousState; if (state === 'playing') canvas.focus({ preventScroll: true }); else $('help').focus({ preventScroll: true }); }
  $('start').onclick = start; $('again').onclick = start; $('restart').onclick = start;
  $('resume').onclick = resume; $('pause').onclick = pause; $('help').onclick = showHelp; $('close-help').onclick = closeHelp; $('help-ok').onclick = closeHelp;
  $('home').onclick = () => { state = 'intro'; $('result-layer').hidden = true; $('hud').hidden = true; $('game-bottom').hidden = true; $('intro').hidden = false; $('best-intro').textContent = `曾留春色 ${best} · 等你再续`; $('start').focus({ preventScroll: true }); };
  $('bloom').onclick = ultimate;

  function addPoints(n, x, y, text) {
    combo++; comboTime = 4; maxCombo = Math.max(maxCombo, combo);
    const multiplier = combo >= 15 ? 3 : combo >= 6 ? 2 : 1;
    const gain = n * multiplier; score += gain;
    floating.push({ x, y: y - 95, text: text || `+${gain}`, life: 1.1, color: '#a14f3f' });
    if ([6, 15, 30, 50].includes(combo)) announce(combo === 6 ? '六芳相续 · 春色双倍' : combo === 15 ? '花事连绵 · 春色三倍' : '满袖花香 · ' + combo + '连芳', 1.8);
  }
  function burst(x, y, color = '#b7756b', count = 12) {
    for (let i = 0; i < (reduced ? Math.min(count, 5) : count); i++) {
      const a = rand(0, Math.PI * 2), v = rand(35, 155);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 25, life: rand(.6, 1.2), max: 1.2, r: rand(2, 6), a, spin: rand(-3, 3), color });
    }
  }
  function spawnFlower(x = rand(85, W - 85), y = rand(minY() + 5, maxY() - 10)) { flowers.push({ x, y, age: 0, seed: rand(0, 6), type: Math.random() < .2 ? 'gold' : 'pink' }); }
  function spawnEnemy() {
    const side = Math.random() < .5 ? -1 : 1;
    const x = side < 0 ? 15 : W - 15, y = rand(minY(), maxY());
    enemies.push({ x, y, age: 0, seed: rand(0, 6), hp: chapter === 2 && Math.random() < .3 ? 2 : 1, phase: 'approach', timer: 0, vx: 0, vy: 0, hit: 0, gold: false });
    enemies[enemies.length - 1].gold = enemies[enemies.length - 1].hp === 2;
  }
  function defeat(e) {
    if (e.dead) return; e.dead = true; butterflyCount++; addPoints(e.gold ? 25 : 20, e.x, e.y); p.energy = Math.min(100, p.energy + 12);
    burst(e.x, e.y - 65, e.gold ? '#b3924e' : '#ad6e71', 17); blooms.push({ x: e.x, y: e.y + 7, size: rand(18, 28), age: 0, color: e.gold ? '#bf9b52' : '#b88878' }); sfx('kill');
  }
  function attack() {
    if (state !== 'playing' || p.atkCD > 0 || p.dash > 0) return;
    p.atk = .32; p.atkCD = .38; sfx('attack');
    for (const e of enemies) {
      if (e.dead) continue;
      if (distance(p, e) < 208 && (e.x - p.x) * p.face > -65 && Math.abs(e.y - p.y) < 115) {
        e.hp--; e.hit = .24;
        if (e.hp <= 0) defeat(e);
        else { e.phase = 'approach'; e.timer = .7; e.x += p.face * 55; burst(e.x, e.y - 70, '#a18b58', 8); }
      }
    }
    for (const f of flowers) if (!f.dead && distance(p, f) < 170 && (f.x - p.x) * p.face > -45) collect(f);
  }
  function dash() {
    if (state !== 'playing' || p.dashCD > 0) return;
    let dx = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
    let dy = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
    const n = Math.hypot(dx, dy); if (n) { dx /= n; dy /= n; } else { dx = p.face; dy = 0; }
    p.dx = dx; p.dy = dy; p.dash = .22; p.dashCD = 1.1; p.atk = 0; sfx('dash');
  }
  function ultimate() {
    if (state !== 'playing' || p.energy < 100) return;
    p.energy = 0; p.hurt = Math.max(p.hurt, 1.5); bloomRing = 1.15;
    for (const e of enemies) if (!e.dead) defeat(e);
    for (const f of flowers) if (!f.dead) collect(f);
    p.energy = 0; // A bloom cannot recharge itself.
    for (let i = 0; i < (reduced ? 6 : 24); i++) burst(rand(60, W - 60), rand(270, 650), ['#b46f70', '#af934e', '#c89d85'][i % 3], reduced ? 2 : 5);
    announce('百 · 花 · 齐 · 放', 2); sfx('bloom'); syncHUD();
  }
  function collect(f) { if (f.dead) return; f.dead = true; flowerCount++; addPoints(f.type === 'gold' ? 20 : 10, f.x, f.y); p.energy = Math.min(100, p.energy + (f.type === 'gold' ? 12 : 7)); burst(f.x, f.y - 28, f.type === 'gold' ? '#ba934b' : '#c48c80', 8); sfx('flower'); }
  function hurt(e) {
    if (p.hurt > 0 || p.dash > 0) return;
    p.hp--; p.hurt = 1.8; combo = 0; comboTime = 0;
    p.x = clamp(p.x + (p.x > e.x ? 48 : -48), 55, W - 55);
    burst(p.x, p.y - 85, '#956c5c', 9); floating.push({ x: p.x, y: p.y - 180, text: '花容 −1', life: 1.2, color: '#924a3a' }); sfx('hurt');
    if (p.hp <= 0) { syncHUD(); end(false); }
  }

  const gameKeys = new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','j','k','l','e','shift','p','escape',' ']);
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (gameKeys.has(k) && (state === 'playing' || state === 'paused' || state === 'help')) e.preventDefault();
    if (k === 'escape' && !$('help-layer').hidden) { closeHelp(); return; }
    if ((k === 'p' || k === 'escape') && !e.repeat) { if (state === 'playing') pause(); else if (state === 'paused') resume(); return; }
    if (state !== 'playing' || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    keys.add(k);
    if (!e.repeat) { if (k === 'j' || k === ' ') attack(); if (k === 'k' || k === 'shift') dash(); if (k === 'l' || k === 'e') ultimate(); }
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => { keys.clear(); if (state === 'playing') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); if (state === 'playing') pause(); } });
  canvas.addEventListener('pointerdown', e => {
    if (state !== 'playing') return; e.preventDefault(); canvas.focus({ preventScroll: true });
    const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W; p.face = x >= p.x ? 1 : -1; keys.add('j'); attack(); canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointerup', () => keys.delete('j')); canvas.addEventListener('pointercancel', () => keys.delete('j'));
  document.querySelectorAll('[data-key], [data-action]').forEach(button => {
    button.addEventListener('pointerdown', e => { e.preventDefault(); if (state !== 'playing') return; button.setPointerCapture(e.pointerId); if (button.dataset.key) keys.add(button.dataset.key); if (button.dataset.action === 'attack') { keys.add('j'); attack(); } if (button.dataset.action === 'dash') dash(); if (button.dataset.action === 'bloom') ultimate(); });
    const release = () => { if (button.dataset.key) keys.delete(button.dataset.key); if (button.dataset.action === 'attack') keys.delete('j'); };
    button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
  });
  // Keep keyboard focus in the open instructions dialog.
  document.addEventListener('keydown', e => { if (e.key !== 'Tab' || $('help-layer').hidden) return; const first = $('close-help'), last = $('help-ok'); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } });

  function update(dt) {
    gameTime += dt;
    if (state !== 'playing') return;
    clock -= dt; elapsed += dt; updateChapter();
    if (clock <= 0) { clock = 0; syncHUD(); end(true); return; }
    p.atk = Math.max(0, p.atk - dt); p.atkCD = Math.max(0, p.atkCD - dt); p.dashCD = Math.max(0, p.dashCD - dt); p.hurt = Math.max(0, p.hurt - dt); bloomRing = Math.max(0, bloomRing - dt);
    if (comboTime > 0) { comboTime -= dt; if (comboTime <= 0) combo = 0; }
    let dx = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
    let dy = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
    const n = Math.hypot(dx, dy); if (n) { dx /= n; dy /= n; if (dx) p.face = dx > 0 ? 1 : -1; p.step += dt * 10; }
    if (p.dash > 0) {
      p.dash = Math.max(0, p.dash - dt); dx = p.dx; dy = p.dy;
      p.x += dx * 1050 * dt; p.y += dy * 660 * dt;
      if (!reduced && (traces.length === 0 || traces[traces.length - 1].life < .2)) traces.push({ x: p.x, y: p.y, face: p.face, life: .26 });
    } else { p.x += dx * 315 * dt; p.y += dy * 215 * dt; }
    p.x = clamp(p.x, 65, W - 65); p.y = clamp(p.y, minY(), maxY());
    if (keys.has('j') || keys.has(' ')) attack();
    spawnClock -= dt; flowerClock -= dt;
    if (spawnClock <= 0) { if (enemies.filter(e => !e.dead).length < (W < 900 ? 8 : 12)) spawnEnemy(); spawnClock = [2.5, 1.8, 1.25][chapter]; }
    if (flowerClock <= 0) { if (flowers.filter(f => !f.dead).length < 13) spawnFlower(); flowerClock = 1.05; }
    flowers.forEach(f => { f.age += dt; if (!f.dead && distance(p, f) < 52) collect(f); });
    for (const e of enemies) {
      if (e.dead) continue; e.age += dt; e.hit = Math.max(0, e.hit - dt); e.timer -= dt;
      const d = distance(p, e), nx = (p.x - e.x) / (d || 1), ny = (p.y - e.y) / (d || 1);
      if (e.phase === 'approach') {
        if (e.timer <= 0 && d < 170) { e.phase = 'warn'; e.timer = .78; }
        else { const speed = (e.gold ? 60 : 73) + chapter * 12; e.x += nx * speed * dt; e.y += ny * speed * .8 * dt; }
      } else if (e.phase === 'warn') {
        if (e.timer <= 0) { e.phase = 'lunge'; e.timer = .35; e.vx = nx * 520; e.vy = ny * 410; }
      } else if (e.phase === 'lunge') {
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (distance(p, e) < 47) hurt(e);
        if (e.timer <= 0) { e.phase = 'rest'; e.timer = 1.05; }
      } else if (e.timer <= 0) { e.phase = 'approach'; e.timer = .15; }
      e.x = clamp(e.x, 12, W - 12); e.y = clamp(e.y, minY() - 20, maxY() + 10);
    }
    flowers = flowers.filter(f => !f.dead && f.age < 17); enemies = enemies.filter(e => !e.dead);
    particles.forEach(v => { v.life -= dt; v.x += v.vx * dt; v.y += v.vy * dt; v.vy += 42 * dt; v.a += v.spin * dt; }); particles = particles.filter(v => v.life > 0);
    floating.forEach(v => { v.life -= dt; v.y -= 36 * dt; }); floating = floating.filter(v => v.life > 0);
    traces.forEach(v => v.life -= dt); traces = traces.filter(v => v.life > 0);
    blooms.forEach(v => v.age += dt); if (blooms.length > 65) blooms.shift();
    if (announcementClock > 0) { announcementClock -= dt; if (announcementClock <= 0) $('announcement').classList.remove('show'); }
    uiClock -= dt; if (uiClock <= 0) { syncHUD(); uiClock = .08; }
    if (sound) { melodyClock -= dt; if (melodyClock <= 0) { const notes = [261.63, 0, 392, 329.63, 293.66, 0, 220, 293.66, 329.63, 0, 392, 523.25, 440, 392, 0, 293.66]; const v = notes[melodyStep++ % notes.length]; if (v) note(v, 2.5, .075); melodyClock = .68; } }
  }

  function flower(x, y, r, color = '#c18d80', rotation = 0, alpha = 1) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.globalAlpha *= alpha;
    ctx.strokeStyle = '#805d4655'; ctx.lineWidth = .7;
    for (let i = 0; i < 7; i++) { ctx.save(); ctx.rotate(i * Math.PI * 2 / 7); ctx.beginPath(); ctx.ellipse(0, -r * .49, r * .38, r * .63, .12, 0, Math.PI * 2); ctx.fillStyle = i % 2 ? color : '#e0b9a1'; ctx.fill(); ctx.stroke(); ctx.restore(); }
    ctx.beginPath(); ctx.arc(0, 0, r * .22, 0, Math.PI * 2); ctx.fillStyle = '#b89a51'; ctx.fill(); ctx.stroke();
    for (let i = 0; i < 5; i++) { const a = i * 1.256; ctx.fillStyle = '#75633e'; ctx.fillRect(Math.cos(a) * r * .13, Math.sin(a) * r * .13, 1, 1); }
    ctx.restore();
  }
  function shadow(x, y, width, alpha = .1) { ctx.save(); ctx.fillStyle = `rgba(75,64,40,${alpha})`; ctx.beginPath(); ctx.ellipse(x, y + 3, width, width * .18, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  function drawLady(x, y, height, face = 1, opts = {}) {
    const moving = state === 'playing' && (keys.has('a') || keys.has('d') || keys.has('w') || keys.has('s') || keys.has('arrowup') || keys.has('arrowdown') || keys.has('arrowleft') || keys.has('arrowright'));
    const bob = reduced ? 0 : moving ? Math.sin(p.step) * 3 : Math.sin(gameTime * 1.6) * 1.3;
    const width = height * lady.naturalWidth / lady.naturalHeight;
    ctx.save(); ctx.translate(x, y + bob); ctx.scale(face, 1);
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    if (opts.dash && !reduced) ctx.rotate(.07);
    if (opts.attack && !reduced) ctx.rotate(-.035 * Math.sin(opts.attack / .32 * Math.PI));
    if (opts.hurt && !reduced) ctx.globalAlpha *= .65 + .35 * Math.sin(gameTime * 13) ** 2;
    ctx.drawImage(height === 215 ? ladyCache : lady, -width * .5, -height, width, height); ctx.restore();
  }
  function butterfly(e, decorative = false) {
    const flutter = reduced ? .8 : .55 + Math.abs(Math.sin(gameTime * (e.gold ? 9 : 13) + e.seed)) * .5;
    const bob = reduced ? 0 : Math.sin(gameTime * 3 + e.seed) * 7;
    const x = e.x, y = e.y - 66 + bob;
    if (e.phase === 'warn') {
      ctx.save(); ctx.strokeStyle = '#ac4d3e'; ctx.globalAlpha = .25 + (1 - Math.max(0, e.timer) / .78) * .5; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(e.x, e.y + 2, 40 + e.timer * 28, 13 + e.timer * 8, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(e.x, e.y - 20); ctx.lineTo(e.x, e.y - 31); ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(e.seed + gameTime) * .15);
    if (decorative) ctx.globalAlpha = .5;
    ctx.fillStyle = e.hit > 0 ? '#c29858' : e.gold ? '#957741' : '#655c56'; ctx.strokeStyle = e.gold ? '#73613d' : '#494641'; ctx.lineWidth = .7;
    for (const side of [-1, 1]) {
      ctx.save(); ctx.scale(side * flutter, 1);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(7, -22, 34, -32, 29, -10); ctx.bezierCurveTo(26, -3, 19, -1, 8, 4); ctx.bezierCurveTo(34, 1, 25, 27, 12, 17); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = e.gold ? '#d8bd7c99' : '#c4b19e80'; ctx.beginPath(); ctx.moveTo(3, 1); ctx.lineTo(24, -15); ctx.moveTo(4, 2); ctx.lineTo(18, 15); ctx.stroke();
      ctx.fillStyle = e.gold ? '#e3c985' : '#d3b69a'; ctx.beginPath(); ctx.ellipse(19, -13, 4, 3, -.6, 0, 6.28); ctx.fill(); ctx.restore();
    }
    ctx.strokeStyle = '#484335'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, 14); ctx.stroke(); ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(-8, -18, -7, -13); ctx.moveTo(0, -6); ctx.quadraticCurveTo(8, -18, 7, -13); ctx.stroke(); ctx.restore();
  }
  function drawBackground() {
    ctx.fillStyle = '#ead7b5'; ctx.fillRect(0, 0, W, H);
    if (!ready) return;
    ctx.drawImage(gardenCache, 0, 0, W, H);
    // Air currents and tiny drifting petals remain quiet enough to read the silk.
    if (!reduced && (state === 'playing' || state === 'intro')) {
      for (let i = 0; i < 15; i++) {
        const x = ((i * 193 + gameTime * (13 + i % 4 * 6)) % (W + 50)) - 25;
        const y = ((i * 137 + gameTime * (9 + i % 3)) % (H + 80)) - 40;
        ctx.save(); ctx.translate(x, y); ctx.rotate(gameTime * .7 + i); ctx.globalAlpha = .2 + i % 3 * .1;
        ctx.fillStyle = ['#a95b51', '#c18d75', '#f6e0bf'][i % 3]; ctx.beginPath(); ctx.ellipse(0, 0, 3, 7, .3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }
    if (state === 'intro') {
      const h = W < 900 ? 385 : 505, x = W < 900 ? W * .85 : W * .705, y = W < 900 ? H * .94 : H * .875;
      shadow(x, y, h * .19, .07); drawLady(x, y, h, 1);
      for (let i = 0; i < 3; i++) butterfly({ x: x + (i - 1) * 95, y: y - 180 - i * 53, seed: i * 2, gold: i === 2 }, true);
    }
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawBackground();
    if (state === 'intro' || !ready) return;
    for (const b of blooms) flower(b.x, b.y, b.size, b.color, b.x, Math.min(.24, b.age * .5));
    for (const f of flowers) {
      const bob = reduced ? 0 : Math.sin(gameTime * 2.3 + f.seed) * 5;
      shadow(f.x, f.y, 16, .08); ctx.save(); ctx.globalAlpha = Math.min(1, f.age * 3, (17 - f.age) / 2);
      ctx.strokeStyle = f.type === 'gold' ? '#b8985655' : '#af7d6540'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(f.x, f.y + 2, 22, 7, 0, 0, 6.28); ctx.stroke();
      flower(f.x, f.y - 28 + bob, f.type === 'gold' ? 19 : 16, f.type === 'gold' ? '#d2ae68' : '#c38b89', f.seed + (reduced ? 0 : gameTime * .13));
      ctx.strokeStyle = '#9b8c5e55'; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(f.x, f.y - 4); ctx.lineTo(f.x, f.y - 14 + bob); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    }
    for (const t of traces) drawLady(t.x, t.y, 215, t.face, { alpha: t.life * .7 });
    const order = [...enemies.map(e => ({ type: 'e', y: e.y, e })), { type: 'p', y: p.y }].sort((a, b) => a.y - b.y);
    for (const item of order) {
      if (item.type === 'e') { shadow(item.e.x, item.e.y, 23, .07); butterfly(item.e); }
      else {
        shadow(p.x, p.y, 45, .12);
        // The fine ring shows the player's actual ground position and dash readiness.
        ctx.save(); ctx.strokeStyle = p.dashCD > 0 ? '#9b8d6d44' : '#857d5a88'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 42, 12, 0, 0, Math.PI * 2); ctx.stroke();
        if (p.dashCD > 0) { ctx.strokeStyle = '#ae7b5588'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 42, 12, 0, 0, Math.PI * 2 * (1 - p.dashCD / 1.1)); ctx.stroke(); }
        ctx.restore(); drawLady(p.x, p.y, 215, p.face, { dash: p.dash, attack: p.atk, hurt: p.hurt });
        if (p.atk > 0) {
          const progress = 1 - p.atk / .32;
          ctx.save(); ctx.translate(p.x, p.y - 70); ctx.scale(p.face, 1); ctx.globalAlpha = (1 - progress) * .8;
          for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(30, 0, 144 + progress * 43 + i * 11, 64 + i * 11, 0, -1.2 + progress * .5, 1.2 + progress * .5); ctx.strokeStyle = ['#fff4d6', '#a4844e', '#be826f'][i]; ctx.lineWidth = i === 0 ? 9 : 1.2; ctx.stroke(); }
          if (!reduced) for (let i = 0; i < 4; i++) flower(95 + Math.cos(i + progress * 2) * 50, Math.sin(i + progress * 2) * 60, 5, '#d6ac90', i);
          ctx.restore();
        }
        if (p.hurt > 0) { ctx.save(); ctx.strokeStyle = '#f7e4b0'; ctx.globalAlpha = .45; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(p.x, p.y - 95, 65, 115, 0, 0, 6.28); ctx.stroke(); ctx.restore(); }
      }
    }
    for (const v of particles) { ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(v.a); ctx.globalAlpha = Math.min(1, v.life / .5); ctx.fillStyle = v.color; ctx.beginPath(); ctx.ellipse(0, 0, v.r * .55, v.r, .5, 0, 6.28); ctx.fill(); ctx.restore(); }
    for (const v of floating) { ctx.save(); ctx.globalAlpha = Math.min(1, v.life * 2); ctx.fillStyle = v.color; ctx.font = '18px "Songti SC","Noto Serif CJK SC",serif'; ctx.textAlign = 'center'; ctx.fillText(v.text, v.x, v.y); ctx.restore(); }
    if (bloomRing > 0) {
      const progress = 1 - bloomRing / 1.15, radius = progress * W * .95;
      ctx.save(); ctx.globalAlpha = (1 - progress) * .55; ctx.strokeStyle = '#f5dcaa'; ctx.lineWidth = reduced ? 2 : 18; ctx.beginPath(); ctx.arc(p.x, p.y - 90, radius, 0, 6.28); ctx.stroke();
      if (!reduced) for (let i = 0; i < 18; i++) { const a = i / 18 * 6.28; flower(p.x + Math.cos(a) * radius, p.y - 90 + Math.sin(a) * radius * .65, 17, '#c98e7f', a + progress); }
      ctx.restore();
    }
  }
  function frame(t) {
    const dt = Math.min((t - lastTime) / 1000 || 0, .5); lastTime = t;
    // Small physics steps retain collision accuracy when a device draws fewer frames.
    const steps = Math.max(1, Math.ceil(dt / .03));
    for (let i = 0; i < steps; i++) update(dt / steps);
    draw(); requestAnimationFrame(frame);
  }
  // Read-only diagnostics for regression checks and load verification.
  window.garden = Object.freeze({ getState: () => ({ state, ready, width: Math.round(W), time: Math.round(clock * 10) / 10, chapter: chapter + 1, score, flowers: flowerCount, butterflies: butterflyCount, combo, maxCombo, health: p.hp, energy: Math.round(p.energy), dashReady: p.dashCD <= 0, player: { x: Math.round(p.x), y: Math.round(p.y), facing: p.face }, enemies: enemies.filter(e => !e.dead).map(e => ({ x: Math.round(e.x), y: Math.round(e.y), phase: e.phase })), pickups: flowers.filter(f => !f.dead).map(f => ({ x: Math.round(f.x), y: Math.round(f.y) })), reducedMotion: reduced, sound }) });
  requestAnimationFrame(frame);
})();
