// Procedural WebAudio sound effects. No audio files (see AGENTS.md).
import { createMusic, type Music, type MusicMode } from './music';

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
let master: GainNode | null = null;
let volume = 0.7;
let ambienceStarted = false;
let music: Music | null = null;
let musicVolume = 0.6;
let musicMode: MusicMode = 'explore';
let analyser: AnalyserNode | null = null;

export function setMusicVolume(v: number): void {
  musicVolume = v;
  music?.setVolume(v);
}

export function setMusicMode(m: MusicMode): void {
  musicMode = m;
  music?.setMode(m);
}

/** Level readout for tests: is sound actually coming out, and where in the spectrum? */
export function audioProbe(): { state: string; rms: number; bass: number; mid: number } | null {
  if (!ctx || !master) return null;
  if (!analyser) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    master.connect(analyser);
  }
  const td = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(td);
  const rms = Math.sqrt(td.reduce((a, b) => a + b * b, 0) / td.length);
  const fd = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(fd);
  const hz = ctx.sampleRate / analyser.fftSize;
  const band = (lo: number, hi: number) => {
    let sum = 0, n = 0;
    for (let i = Math.floor(lo / hz); i <= Math.floor(hi / hz); i++) { sum += fd[i]; n++; }
    return n ? sum / n : 0;
  };
  return { state: ctx.state, rms, bass: band(20, 90), mid: band(150, 2000) };
}

export function setVolume(v: number): void {
  volume = v;
  if (master) master.gain.value = v;
}

/** Call from a user gesture. */
export function initAudio(): void {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (!music) {
    music = createMusic(ctx, master!, noiseBuf!);
    music.setVolume(musicVolume);
    music.setMode(musicMode);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  music.start();
  startAmbience();
}

function tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, delay = 0): void {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur);
}

function noise(dur: number, f0: number, f1: number, vol: number, type: BiquadFilterType = 'bandpass', delay = 0): void {
  if (!ctx || !noiseBuf) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master!);
  s.start(t);
  s.stop(t + dur);
}

/** Occasional water drips over the music. */
function startAmbience(): void {
  if (!ctx || ambienceStarted) return;
  ambienceStarted = true;
  const drip = () => {
    tone(1500 + Math.random() * 800, 700, 0.09, 'sine', 0.05);
    window.setTimeout(drip, 2500 + Math.random() * 6000);
  };
  window.setTimeout(drip, 3000);
}

export const sfx = {
  step: () => noise(0.09, 260 + Math.random() * 120, 120, 0.09, 'lowpass'),
  swing: () => noise(0.22, 500, 1800, 0.35),
  hitEnemy: () => {
    noise(0.12, 900, 200, 0.5, 'lowpass');
    tone(160, 50, 0.16, 'sine', 0.5);
  },
  enemyDie: () => {
    tone(120, 30, 0.5, 'sawtooth', 0.25);
    noise(0.4, 600, 80, 0.4, 'lowpass');
  },
  playerHurt: () => {
    tone(90, 40, 0.3, 'square', 0.3);
    noise(0.25, 400, 100, 0.45, 'lowpass');
  },
  rise: () => {
    noise(1.3, 80, 300, 0.5, 'lowpass');
    tone(55, 90, 1.2, 'sawtooth', 0.12);
  },
  enemyWindup: () => tone(200, 120, 0.3, 'sawtooth', 0.08),
  creak: () => {
    tone(180, 420, 0.5, 'sawtooth', 0.12);
    tone(420, 210, 0.7, 'sawtooth', 0.1, 0.5);
    noise(1.2, 900, 500, 0.06);
  },
  block: () => {
    tone(760, 520, 0.14, 'square', 0.14);
    noise(0.12, 3400, 1800, 0.22, 'bandpass');
    tone(210, 140, 0.18, 'triangle', 0.2);
  },
  guardBreak: () => {
    tone(300, 80, 0.4, 'sawtooth', 0.25);
    noise(0.35, 2600, 300, 0.4, 'bandpass');
  },
  coin: () => {
    tone(1320, 1760, 0.08, 'square', 0.08);
    tone(1760, 2200, 0.12, 'square', 0.06, 0.06);
  },
  equip: () => {
    noise(0.1, 2500, 1200, 0.2, 'bandpass');
    tone(300, 220, 0.08, 'triangle', 0.15);
  },
  stairs: () => {
    noise(0.9, 400, 80, 0.4, 'lowpass');
    tone(110, 55, 0.9, 'sine', 0.2);
  },
  levelUp: () => {
    tone(392, 784, 0.4, 'triangle', 0.18);
    tone(523, 1046, 0.5, 'triangle', 0.14, 0.12);
  },
  bossRoar: () => {
    tone(70, 38, 1.6, 'sawtooth', 0.35);
    tone(95, 45, 1.4, 'square', 0.14, 0.1);
    noise(1.6, 500, 60, 0.45, 'lowpass');
  },
  bossWindup: () => tone(150, 90, 0.5, 'sawtooth', 0.12),
  bossSlam: () => {
    tone(80, 30, 0.45, 'sine', 0.5);
    noise(0.4, 700, 60, 0.5, 'lowpass');
  },
  bossDie: () => {
    tone(100, 25, 2.4, 'sawtooth', 0.3);
    noise(2.2, 400, 40, 0.45, 'lowpass');
    tone(330, 660, 1.2, 'sine', 0.12, 1.4);
  },
  heal: () => {
    tone(520, 780, 0.35, 'sine', 0.16);
    tone(780, 1040, 0.4, 'sine', 0.1, 0.1);
  },
  recover: () => {
    tone(440, 880, 0.5, 'sine', 0.18);
    tone(660, 1320, 0.7, 'sine', 0.12, 0.1);
  },
  death: () => {
    tone(110, 35, 1.8, 'sawtooth', 0.3);
    noise(1.5, 300, 40, 0.4, 'lowpass');
  },
};
