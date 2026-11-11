/* Shared original soundtrack player. Media starts only after a user gesture. */
(() => {
  'use strict';
  const media = document.getElementById('bgm');
  if (!media) return;
  const slider = document.getElementById('music-volume');
  const output = document.getElementById('music-volume-value');
  let enabled = true, volume = .55, started = false, state = 'intro', fadeId = 0;
  try {
    enabled = localStorage.getItem('zanhua-sound') !== 'off';
    const saved = localStorage.getItem('zanhua-music-volume');
    if (saved !== null && Number.isFinite(Number(saved))) volume = Math.max(0, Math.min(1, Number(saved)));
  } catch (_) {}
  media.loop = true;
  media.volume = 0;
  media.dataset.volume = "0";
  media.dataset.playback = 'ready';
  const stateLevel = () => state === 'paused' || state === 'help' ? .25 : state === 'intro' || state === 'ended' ? .62 : 1;
  const target = () => enabled ? volume * stateLevel() : 0;
  function save(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }
  function showVolume() {
    const percent = Math.round(volume * 100);
    if (slider) { slider.value = percent; slider.setAttribute('aria-valuetext', percent + '%'); }
    if (output) output.textContent = percent + '%';
  }
  function fade(to, after) {
    cancelAnimationFrame(fadeId);
    const from = media.volume, begin = performance.now();
    const step = now => {
      const progress = Math.min(1, Math.max(0, (now - begin) / 280));
      media.volume = Math.max(0, Math.min(1, from + (to - from) * progress));
      media.dataset.volume = String(media.volume);
      if (progress < 1) fadeId = requestAnimationFrame(step);
      else {
        if (!enabled) { media.pause(); media.dataset.playback = "muted"; }
        if (after) after();
      }
    };
    fadeId = requestAnimationFrame(step);
  }
  function play() {
    if (!enabled || document.hidden) return;
    const result = media.play();
    if (result && result.catch) result.catch(() => { media.dataset.playback = 'awaiting-gesture'; });
  }
  function start() { started = true; if (enabled) { play(); fade(target()); } }
  function setEnabled(value) {
    enabled = !!value;
    save('zanhua-sound', enabled ? 'on' : 'off');
    if (enabled) start();
    else fade(0, () => { if (!enabled) { media.pause(); media.dataset.playback = 'muted'; } });
  }
  function setState(value) { if (value === state) return; state = value; if (started) fade(target()); }
  if (slider) slider.addEventListener('input', () => {
    volume = Math.max(0, Math.min(1, Number(slider.value) / 100));
    showVolume(); save('zanhua-music-volume', String(volume));
    if (started) fade(target());
  });
  media.addEventListener('playing', () => { media.dataset.playback = 'playing'; });
  media.addEventListener('error', () => { media.dataset.playback = 'error'; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { media.pause(); media.dataset.playback = 'background'; }
    else if (started && enabled) { play(); fade(target()); }
  });
  document.addEventListener('pointerdown', () => { if (started && enabled && media.paused) play(); }, { passive: true });
  showVolume();
  window.GardenMusic = Object.freeze({ start, setEnabled, setState, get enabled() { return enabled; } });
})();
