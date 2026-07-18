import { onUnmounted, watch } from 'vue';
import { useMute } from './useMute.js';

interface StingNote {
  onsetMs: number;
  // Chord root first (the sub oscillator doubles it an octave down), then the upper voices.
  freqs: [number, ...number[]];
  durSec: number;
  gain: number;
  cutoffHz: number;
  swell?: boolean;
}

// The dramatic sting: Am → C#m → Em, the bass walking up A2 → C#3 → E2, with the final chord swelling into
// a held ring-out. Chords are voiced as fundamental frequencies in Hz.
const NOTES: StingNote[] = [
  { onsetMs: 0, freqs: [110, 164.81, 220, 261.63, 329.63], durSec: 1.0, gain: 0.55, cutoffHz: 1500 },
  { onsetMs: 700, freqs: [138.59, 207.65, 277.18, 329.63], durSec: 1.0, gain: 0.6, cutoffHz: 1600 },
  { onsetMs: 1400, freqs: [82.41, 123.47, 164.81, 196, 246.94, 329.63], durSec: 3.8, gain: 1, cutoffHz: 2000, swell: true },
];

/** Note onsets in ms. The reveal animation steps on these same times, so sound and motion cannot drift. */
export const STING_NOTE_TIMES_MS: readonly number[] = NOTES.map((note) => note.onsetMs);

/** Total audible length in ms (last onset + its ring-out); the reveal's continuous growth spans exactly this. */
export const STING_TOTAL_MS = Math.max(...NOTES.map((note) => note.onsetMs + note.durSec * 1000));

const DETUNE_CENTS = [-6, 0, 6];

// Everything is synthesized on demand — no audio assets to load. The context and output chain are created
// once and reused across rounds.
let ctx: AudioContext | null = null;
let output: { compressor: DynamicsCompressorNode; reverb: ConvolverNode; wet: GainNode } | null = null;
let active: GainNode | null = null;

function context(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

// The persistent output chain: reverb → wet → compressor → destination, wired exactly once. Each play only
// attaches (and stop detaches) its own master gain, so repeated stings cannot stack reverb sends or leak
// nodes. The synthetic hall is a two-second burst of exponentially decaying noise as the convolver impulse;
// the convolver normalizes the buffer, so the wet level is controlled solely by the wet gain.
function outputChain(ac: AudioContext): { compressor: DynamicsCompressorNode; reverb: ConvolverNode; wet: GainNode } {
  if (output) {
    return output;
  }
  const length = Math.floor(ac.sampleRate * 2);
  const impulse = ac.createBuffer(2, length, ac.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const samples = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
    }
  }
  const reverb = ac.createConvolver();
  reverb.buffer = impulse;
  // Gentle glue, not a limiter — the per-note normalization keeps peaks well under full scale.
  const compressor = ac.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 20;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.3;
  const wet = ac.createGain();
  wet.gain.value = 0.35;
  reverb.connect(wet);
  wet.connect(compressor);
  compressor.connect(ac.destination);
  output = { compressor, reverb, wet };
  return output;
}

function scheduleNote(ac: AudioContext, dest: GainNode, t: number, note: StingNote): void {
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.8;
  filter.frequency.setValueAtTime(note.cutoffHz, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(180, note.cutoffHz * 0.25), t + note.durSec);
  filter.connect(gain);
  gain.connect(dest);

  // Normalize by oscillator count so stacking chord tones cannot clip the output.
  const peak = note.gain / (note.freqs.length * DETUNE_CENTS.length);
  const g = gain.gain;
  g.setValueAtTime(0.0001, t);
  if (note.swell) {
    g.exponentialRampToValueAtTime(peak * 0.3, t + 0.06);
    g.exponentialRampToValueAtTime(peak, t + 0.7);
    g.exponentialRampToValueAtTime(0.0001, t + note.durSec);
  } else {
    g.exponentialRampToValueAtTime(peak, t + 0.06);
    g.exponentialRampToValueAtTime(0.0001, t + note.durSec);
  }

  // Brass-ish body: a lightly detuned sawtooth stack per chord tone.
  for (const freq of note.freqs) {
    for (const detune of DETUNE_CENTS) {
      const osc = ac.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + note.durSec + 0.05);
    }
  }

  // A sub sine an octave below the chord root, for weight.
  const sub = ac.createOscillator();
  const subGain = ac.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(note.freqs[0] / 2, t);
  subGain.gain.setValueAtTime(0.0001, t);
  subGain.gain.exponentialRampToValueAtTime(note.gain * 0.4, t + 0.06);
  subGain.gain.exponentialRampToValueAtTime(0.0001, t + note.durSec);
  sub.connect(subGain);
  subGain.connect(dest);
  sub.start(t);
  sub.stop(t + note.durSec + 0.05);
}

// Fade fast rather than disconnecting instantly, so muting mid-sting cannot click. The master only gates the
// chain's input; the convolver keeps emitting its two-second tail on its own, so the wet gain is faded too
// (and restored on the next play).
function stop(): void {
  if (!ctx || !active) {
    return;
  }
  const master = active;
  active = null;
  master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  output?.wet.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  setTimeout(() => master.disconnect(), 250);
}

export function useSting(): { play: () => void } {
  const muted = useMute();

  // Honor the global toggle mid-sting, matching the clip player's live mute behavior.
  watch(muted, (isMuted) => {
    if (isMuted) {
      stop();
    }
  });
  onUnmounted(stop);

  function play(): void {
    if (muted.value) {
      return;
    }
    const ac = context();
    if (ac.state !== 'running') {
      void ac.resume();
    }
    stop();

    const { compressor, reverb, wet } = outputChain(ac);
    wet.gain.cancelScheduledValues(ac.currentTime);
    wet.gain.setValueAtTime(0.35, ac.currentTime);
    const master = ac.createGain();
    master.gain.value = 0.8;
    master.connect(compressor);
    master.connect(reverb);

    const t0 = ac.currentTime + 0.08;
    for (const note of NOTES) {
      scheduleNote(ac, master, t0 + note.onsetMs / 1000, note);
    }
    active = master;

    // On a suspended context (no user activation yet, e.g. right after a reload) currentTime freezes, so a
    // late resume would replay the whole sting out of sync with the animation — drop the graph instead.
    setTimeout(() => {
      if (ac.state !== 'running' && active === master) {
        active = null;
        master.disconnect();
      }
    }, 300);
  }

  return { play };
}
