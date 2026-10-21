"use client";
// Minimal WebAudio sound set: move click, check alert, low-time warning.
// No audio files needed — synthesized tones, gated behind a user-sound
// preference flag so nothing autoplays before interaction.

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function tone(freq: number, ms: number, type: OscillatorType = "sine", gain = 0.08) {
  if (!enabled || typeof window === "undefined") return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    vol.gain.setValueAtTime(gain, ctx.currentTime);
    vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
    osc.connect(vol).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + ms / 1000);
  } catch {
    // audio is best-effort
  }
}

export const sounds = {
  move: () => tone(520, 60, "square", 0.05),
  capture: () => tone(340, 90, "square", 0.06),
  check: () => { tone(660, 110); setTimeout(() => tone(880, 140), 110); },
  lowTime: () => { tone(980, 90, "sawtooth", 0.07); setTimeout(() => tone(980, 90, "sawtooth", 0.07), 160); },
  gameEnd: () => { tone(392, 160); setTimeout(() => tone(523, 220), 160); },
};
