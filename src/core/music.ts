// Generative background music, built from oscillators: no audio files (see AGENTS.md).
// A slow minor-key progression with pads, bass and sparse echoing notes. Boss fights switch to a
// faster, heavier version with drums.

export type MusicMode = 'explore' | 'boss';

export interface Music {
  start(): void;
  setMode(m: MusicMode): void;
  setVolume(v: number): void;
}

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

// A minor, falling to the dominant: Am - F - Dm - E.
const CHORDS: { root: number; tones: number[] }[] = [
  { root: 45, tones: [45, 52, 57, 60] },
  { root: 41, tones: [41, 48, 53, 57] },
  { root: 38, tones: [38, 45, 50, 53] },
  { root: 40, tones: [40, 47, 52, 56] },
];
// A natural minor pentatonic, for melody notes, in the octaves that carry well on small speakers.
const SCALE = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79];

const BPM: Record<MusicMode, number> = { explore: 54, boss: 92 };

export function createMusic(ctx: AudioContext, out: AudioNode, noiseBuf: AudioBuffer): Music {
  const bus = ctx.createGain();
  bus.gain.value = 0.6;
  bus.connect(out);

  // Reverb: a generated tail of decaying noise.
  const len = Math.floor(ctx.sampleRate * 2.8);
  const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = impulse.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse;
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.55;
  const reverbOut = ctx.createGain();
  reverbOut.gain.value = 0.7;
  reverbSend.connect(reverb).connect(reverbOut).connect(bus);

  const padFilter = ctx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = 1300;
  padFilter.connect(bus);
  padFilter.connect(reverbSend);

  const melodyFilter = ctx.createBiquadFilter();
  melodyFilter.type = 'lowpass';
  melodyFilter.frequency.value = 2400;
  const echo = ctx.createDelay(1.5);
  echo.delayTime.value = 0.46;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.38;
  melodyFilter.connect(bus);
  melodyFilter.connect(reverbSend);
  melodyFilter.connect(echo);
  echo.connect(feedback).connect(echo);
  echo.connect(bus);
  echo.connect(reverbSend);

  const note = (t: number, dur: number, freq: number, vol: number, dest: AudioNode, type: OscillatorType, attack: number, release: number, detune = 0) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, Math.max(t + attack, t + dur - release));
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  const pluck = (t: number, freq: number, vol: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 1.9);
    o.connect(g).connect(melodyFilter);
    o.start(t);
    o.stop(t + 2);
  };

  const drum = (t: number, kind: 'kick' | 'snare' | 'tick', vol: number) => {
    if (kind === 'kick') {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(170, t);
      o.frequency.exponentialRampToValueAtTime(55, t + 0.22);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.32);
      return;
    }
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = kind === 'snare' ? 1700 : 4200;
    const g = ctx.createGain();
    const dur = kind === 'snare' ? 0.16 : 0.05;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(bus);
    s.start(t);
    s.stop(t + dur + 0.02);
  };

  let mode: MusicMode = 'explore';
  let nextBar = 0;
  let bar = 0;
  let started = false;

  const scheduleBar = () => {
    const bpm = BPM[mode];
    const beat = 60 / bpm;
    const barDur = beat * 4;
    const t0 = Math.max(nextBar, ctx.currentTime + 0.05);
    const chord = CHORDS[bar % CHORDS.length];

    // Pad: every chord tone, two slightly detuned voices each.
    for (const m of chord.tones) {
      for (const det of [-7, 7]) note(t0, barDur + 1.6, mtof(m + 12), 0.05, padFilter, 'triangle', 1.6, 2.2, det);
    }
    // Bass: the root an octave up so small speakers carry it, plus a soft sub underneath.
    note(t0, barDur * 0.95, mtof(chord.root + 12), 0.17, bus, 'sine', 0.05, 0.5);
    note(t0, barDur * 0.95, mtof(chord.root), 0.09, bus, 'sine', 0.05, 0.5);

    // Melody: sparse notes, more of them (and faster) in a boss fight.
    const chance = mode === 'boss' ? 0.75 : 0.36;
    for (let i = 0; i < 4; i++) {
      if (Math.random() > chance) continue;
      const pool = Math.random() < 0.55 ? chord.tones.map((m) => m + 24) : SCALE;
      const m = pool[Math.floor(Math.random() * pool.length)];
      pluck(t0 + i * beat + (Math.random() < 0.3 ? beat / 2 : 0), mtof(m), 0.11);
    }

    if (mode === 'boss') {
      for (let i = 0; i < 4; i++) {
        drum(t0 + i * beat, 'kick', i % 2 ? 0.28 : 0.45);
        drum(t0 + i * beat + beat / 2, 'tick', 0.05);
        if (i === 1 || i === 3) drum(t0 + i * beat, 'snare', 0.1);
      }
    }

    nextBar = t0 + barDur;
    bar++;
    // Schedule the next bar shortly before this one ends.
    window.setTimeout(scheduleBar, Math.max(200, (nextBar - ctx.currentTime - 0.6) * 1000));
  };

  return {
    start() {
      if (started) return;
      started = true;
      nextBar = ctx.currentTime + 0.3;
      scheduleBar();
    },
    setMode(m) {
      mode = m; // takes effect from the next bar
    },
    setVolume(v) {
      bus.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
    },
  };
}
