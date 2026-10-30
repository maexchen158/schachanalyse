// Zugklänge, im Browser erzeugt (Web Audio). Keine fremden Klangdateien.
//
// Arten: move (Figur setzen), capture (Schlagen), castle (Rochade),
// promote (Umwandlung), check (Schach).
// Eigene Dateien lassen sich in config.js unter SOUNDS.files eintragen.

import { SOUNDS } from './config.js';

let ctx = null;
let master = null;
let noise = null;
const buffers = {}; // eigene Dateien, falls eingetragen

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.connect(ctx.destination);
  // Weißes Rauschen als Grundlage für das Holzklacken
  noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  loadFiles();
  return ctx;
}

async function loadFiles() {
  for (const [name, url] of Object.entries(SOUNDS.files ?? {})) {
    try {
      const res = await fetch(url);
      if (res.ok) buffers[name] = await ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      // Datei fehlt: erzeugter Klang bleibt
    }
  }
}

// Browser erlauben Ton erst nach einer Nutzeraktion
export function unlockAudio() {
  const c = ensureContext();
  if (c?.state === 'suspended') c.resume();
}

// Kurzes Holzklacken: gefiltertes Rauschen plus tiefer Körper
function click(t, { freq = 1700, q = 1.4, decay = 0.05, gain = 0.9, body = 165, bodyGain = 0.55 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(bp).connect(g).connect(master);
  src.start(t);
  src.stop(t + decay + 0.02);

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(body * 1.25, t);
  osc.frequency.exponentialRampToValueAtTime(body, t + 0.03);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(bodyGain, t + 0.003);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  osc.connect(og).connect(master);
  osc.start(t);
  osc.stop(t + 0.1);
}

// Heller Glockenton (für die Umwandlung)
function chime(t, freq, { gain = 0.22, decay = 0.45 } = {}) {
  for (const [mult, amp] of [[1, 1], [2.01, 0.35], [3.02, 0.12]]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * mult;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain * amp, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + decay + 0.05);
  }
}

const SYNTH = {
  move: (t) => click(t),
  capture: (t) => {
    click(t, { freq: 2600, q: 0.9, decay: 0.035, gain: 1 });
    click(t + 0.014, { freq: 1250, decay: 0.07, gain: 0.9, body: 120, bodyGain: 0.7 });
  },
  castle: (t) => {
    click(t, { freq: 1600 });
    click(t + 0.12, { freq: 1900, body: 180 });
  },
  promote: (t) => {
    click(t);
    chime(t + 0.06, 784);
    chime(t + 0.15, 1175);
  },
  check: (t) => {
    click(t, { freq: 1900 });
    chime(t + 0.03, 1568, { gain: 0.12, decay: 0.18 });
  },
};

// Welche Art Klang gehört zu einem Zug (Knoten des Partiebaums)?
export function soundForNode(node) {
  if (!node?.san) return null;
  if (node.uci?.length === 5) return 'promote';
  if (node.san.startsWith('O-O')) return 'castle';
  if (/[+#]/.test(node.san)) return 'check';
  if (node.captured) return 'capture';
  return 'move';
}

export function playSound(kind, volume) {
  if (!kind || volume <= 0) return;
  const c = ensureContext();
  if (!c) return;
  // Ohne vorherige Nutzeraktion bleibt der Kontext pausiert; dann nachholen, sobald erlaubt
  if (c.state !== 'running') {
    c.resume().then(() => playSound(kind, volume)).catch(() => {});
    return;
  }
  master.gain.value = volume;
  const t = c.currentTime + 0.005;
  if (buffers[kind]) {
    const src = c.createBufferSource();
    src.buffer = buffers[kind];
    src.connect(master);
    src.start(t);
    return;
  }
  SYNTH[kind]?.(t);
}
