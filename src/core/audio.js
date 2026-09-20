// ---------------------------------------------------------------------------
// AUDIO
// ---------------------------------------------------------------------------
// There are no audio files in the repo, so every cue is synthesised from a tiny
// WebAudio voice description. Dropping real sound in later is a one-liner:
//
//     import { useSamples } from './core/audio.js';
//     useSamples({ click: 'audio/click.wav', sell: 'audio/cha-ching.mp3' });
//
// Any cue with a sample plays the sample; the rest keep using the synth.

import { state } from './state.js';

// type: 'tone' | 'sweep' | 'noise' | 'chord'
export const CUES = {
  click:    { type: 'tone',  freq: 520,  to: 660,  dur: 0.05, gain: 0.07, wave: 'square' },
  clickBig: { type: 'sweep', freq: 420,  to: 900,  dur: 0.12, gain: 0.09, wave: 'sawtooth' },
  buy:      { type: 'tone',  freq: 300,  to: 240,  dur: 0.09, gain: 0.08, wave: 'triangle' },
  crate:    { type: 'sweep', freq: 180,  to: 520,  dur: 0.22, gain: 0.10, wave: 'sawtooth' },
  drop:     { type: 'tone',  freq: 720,  to: 720,  dur: 0.05, gain: 0.05, wave: 'sine' },
  rare:     { type: 'chord', notes: [660, 880, 1320], dur: 0.45, gain: 0.08, wave: 'triangle' },
  craft:    { type: 'sweep', freq: 240,  to: 880,  dur: 0.3,  gain: 0.09, wave: 'square' },
  sell:     { type: 'chord', notes: [880, 1174], dur: 0.2, gain: 0.08, wave: 'sine' },
  error:    { type: 'tone',  freq: 150,  to: 110,  dur: 0.14, gain: 0.07, wave: 'sawtooth' },
  unlock:   { type: 'chord', notes: [523, 659, 784, 1047], dur: 0.6, gain: 0.07, wave: 'triangle' },
  nuclear:  { type: 'sweep', freq: 90,   to: 1400, dur: 0.9,  gain: 0.12, wave: 'sawtooth' },
  crash:    { type: 'noise', dur: 0.4, gain: 0.12 },
  nitro:    { type: 'sweep', freq: 400,  to: 1500, dur: 0.25, gain: 0.09, wave: 'square' },
  coin:     { type: 'chord', notes: [988, 1319], dur: 0.12, gain: 0.06, wave: 'square' },
  tickUp:   { type: 'tone',  freq: 1200, to: 1400, dur: 0.03, gain: 0.03, wave: 'sine' },
};

let ctx = null;
const samples = {};        // name -> AudioBuffer
const samplePaths = {};    // name -> url (loaded lazily)

function context() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Browsers need a gesture before audio works; call this from the first click. */
export function unlockAudio() { context(); }

export function useSamples(map) {
  Object.assign(samplePaths, map);
  const ac = context();
  if (!ac) return;
  for (const [name, url] of Object.entries(map)) {
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => ac.decodeAudioData(buf))
      .then((decoded) => { samples[name] = decoded; })
      .catch(() => { /* fall back to the synth voice */ });
  }
}

export function play(name, { rate = 1, gain = 1 } = {}) {
  if (state.settings.muted) return;
  const ac = context();
  if (!ac) return;

  if (samples[name]) {
    const src = ac.createBufferSource();
    const g = ac.createGain();
    src.buffer = samples[name];
    src.playbackRate.value = rate;
    g.gain.value = gain;
    src.connect(g).connect(ac.destination);
    src.start();
    return;
  }

  const cue = CUES[name];
  if (!cue) return;
  const t0 = ac.currentTime;
  const master = ac.createGain();
  master.gain.value = (cue.gain || 0.08) * gain;
  master.connect(ac.destination);

  if (cue.type === 'noise') {
    const len = Math.floor(ac.sampleRate * cue.dur);
    const buffer = ac.createBuffer(1, len, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, t0);
    filter.frequency.exponentialRampToValueAtTime(180, t0 + cue.dur);
    src.connect(filter).connect(master);
    src.start(t0);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + cue.dur);
    return;
  }

  const notes = cue.type === 'chord' ? cue.notes : [cue.freq];
  notes.forEach((freq, i) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = cue.wave || 'sine';
    osc.frequency.setValueAtTime(freq * rate, t0);
    if (cue.type !== 'chord' && cue.to) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, cue.to * rate), t0 + cue.dur);
    }
    const start = t0 + (cue.type === 'chord' ? i * 0.055 : 0);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(1 / notes.length, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + cue.dur);
    osc.connect(g).connect(master);
    osc.start(start);
    osc.stop(start + cue.dur + 0.05);
  });
}

export function setMuted(muted) {
  state.settings.muted = !!muted;
  if (!muted) context();
}
