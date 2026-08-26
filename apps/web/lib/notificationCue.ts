"use client";

import { useSourcesStore } from "@/store/useSourcesStore";

/**
 * The sound a notification makes: a projector starting up.
 *
 * A reel's shutter ticking as the motor finds its speed, the motor humming up
 * underneath it, and a warm chime as the lamp settles. About 900ms.
 *
 * Synthesised rather than shipped as a file, for three reasons: an audio clip
 * is a network request and a cache entry for under a second of sound; a sound
 * lifted from a film or a series is the studio's copyright, and the famous
 * stingers — the streaming ta-dum, the deep note before a feature — are
 * registered sound marks that a public site may not simply borrow; and the
 * shape of a cue is easier to tune as numbers than in an editor.
 *
 * So it is the cinema itself rather than anything filmed in one: nobody owns
 * the sound of a projector.
 */

/**
 * One context for the page.
 *
 * Browsers cap how many a document may create, and creating one per
 * notification would eventually throw — after which nothing would play again
 * for the rest of the session.
 */
let ctx: AudioContext | null = null;
let primed = false;

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;

  const Ctor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!Ctor) return null;

  try {
    ctx = new Ctor();
    return ctx;
  } catch {
    // Some browsers refuse before any interaction at all. Nothing to do but
    // stay silent — a notification that arrives without its sound is still a
    // notification.
    return null;
  }
}

/**
 * Wakes the audio context on the first thing the visitor does.
 *
 * Every browser starts an AudioContext suspended until a real user gesture,
 * so a cue that arrives from a background poll — which is every cue this app
 * plays — would be scheduled into a clock that isn't running. Resuming on the
 * first click or keypress means the context is awake long before any
 * notification lands, and this costs nothing on a page nobody touches.
 */
export function primeNotificationCue(): () => void {
  if (typeof window === "undefined" || primed) return () => {};
  primed = true;

  const wake = () => {
    const audio = audioContext();
    if (audio && audio.state === "suspended") void audio.resume().catch(() => {});
  };

  window.addEventListener("pointerdown", wake, { once: true, passive: true });
  window.addEventListener("keydown", wake, { once: true });

  return () => {
    window.removeEventListener("pointerdown", wake);
    window.removeEventListener("keydown", wake);
  };
}

/**
 * A fifth of a second of white noise, made once and shared.
 *
 * Every shutter tick is a slice of this through a bandpass — a mechanical
 * click has no pitch, so an oscillator is the wrong source for one. Building a
 * buffer per tick would allocate a dozen times per cue for identical noise.
 */
const noiseFor = new WeakMap<BaseAudioContext, AudioBuffer>();

function noise(audio: BaseAudioContext): AudioBuffer {
  const cached = noiseFor.get(audio);
  if (cached) return cached;

  const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.2), audio.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

  noiseFor.set(audio, buffer);
  return buffer;
}

/**
 * Schedules the cue onto any audio context.
 *
 * Split out from `playNotificationCue` so the same graph can be rendered into
 * an `OfflineAudioContext` — which needs no user gesture and runs in a hidden
 * tab — and checked for the shape it is supposed to have. A sound nobody can
 * measure is a sound nobody can be sure shipped.
 */
export function scheduleProjectorCue(audio: BaseAudioContext, at: number): void {
  /*
     Levels tuned by rendering this into an `OfflineAudioContext` and reading
     the peak back, not by ear — the browser this was built in cannot play
     audio at all. The set below peaks at 0.46 with no clipping, and the first
     shutter tick is audible rather than a whisper the chime arrives to
     explain.
  */
  const out = audio.createGain();
  out.gain.value = 1;
  out.connect(audio.destination);

  /* ---- the motor, coming up to speed ---- */

  // A triangle rather than a sine: a projector motor is a machine, and the
  // extra harmonics are what stop this reading as a test tone.
  const motor = audio.createOscillator();
  motor.type = "triangle";
  motor.frequency.setValueAtTime(42, at);
  motor.frequency.exponentialRampToValueAtTime(64, at + 0.35);
  motor.frequency.setValueAtTime(64, at + 0.55);
  motor.frequency.exponentialRampToValueAtTime(52, at + 0.85);

  const motorTone = audio.createBiquadFilter();
  motorTone.type = "lowpass";
  motorTone.frequency.value = 260;

  const motorLevel = audio.createGain();
  motorLevel.gain.setValueAtTime(0.0001, at);
  motorLevel.gain.exponentialRampToValueAtTime(0.2, at + 0.18);
  motorLevel.gain.setValueAtTime(0.2, at + 0.5);
  motorLevel.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);

  motor.connect(motorTone);
  motorTone.connect(motorLevel);
  motorLevel.connect(out);
  motor.start(at);
  motor.stop(at + 0.95);

  /* ---- the shutter, accelerating ---- */

  /*
     Twelve ticks whose spacing closes from 88ms to 30ms.

     The acceleration is the whole illusion: evenly spaced clicks are a clock,
     and a projector that is already at speed has not started up. They get
     slightly louder as they tighten, the way a reel does as it takes the
     tension.
  */
  const TICKS = 12;
  let when = at;
  for (let i = 0; i < TICKS; i++) {
    const progress = i / (TICKS - 1);
    const tick = audio.createBufferSource();
    tick.buffer = noise(audio);
    // A different slice of the buffer each time, so twelve identical clicks
    // don't come out as one stuttering artefact.
    tick.playbackRate.value = 0.9 + Math.random() * 0.3;

    // Narrow and high: the sound is a shutter blade passing, not a thud.
    const body = audio.createBiquadFilter();
    body.type = "bandpass";
    body.frequency.value = 1800 + progress * 700;
    body.Q.value = 1.4;

    const level = audio.createGain();
    level.gain.setValueAtTime(0.0001, when);
    level.gain.exponentialRampToValueAtTime(0.18 + progress * 0.12, when + 0.004);
    level.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);

    tick.connect(body);
    body.connect(level);
    level.connect(out);
    tick.start(when, Math.random() * 0.1, 0.06);

    when += 0.088 - progress * 0.058;
  }

  /* ---- the lamp settling ---- */

  /*
     C5 with its octave a whisper above it, arriving as the shutter reaches
     speed. Slower attack than anything else here — 30ms — because a lamp
     coming up is the one part of this that is not mechanical, and a sharp
     attack would make it another click.
  */
  const chimeTone = audio.createBiquadFilter();
  chimeTone.type = "lowpass";
  chimeTone.frequency.value = 3000;
  chimeTone.connect(out);

  for (const [freq, level, delay] of [
    [523.25, 0.34, 0.5],
    [1046.5, 0.116, 0.52],
  ] as const) {
    const tone = audio.createOscillator();
    tone.type = "sine";
    tone.frequency.value = freq;

    const toneLevel = audio.createGain();
    toneLevel.gain.setValueAtTime(0.0001, at + delay);
    toneLevel.gain.exponentialRampToValueAtTime(level, at + delay + 0.03);
    toneLevel.gain.exponentialRampToValueAtTime(0.0001, at + delay + 0.42);

    tone.connect(toneLevel);
    toneLevel.connect(chimeTone);
    tone.start(at + delay);
    tone.stop(at + delay + 0.45);
  }
}

export async function playNotificationCue(): Promise<void> {
  // The preference lives with the rest of the app's settings, so muting it is
  // one switch in the same place as everything else.
  if (!useSourcesStore.getState().settings.notificationSound) return;

  const audio = audioContext();
  if (!audio) return;

  try {
    if (audio.state === "suspended") await audio.resume();
    // Still asleep means the visitor has not interacted with the page yet, and
    // scheduling into a stopped clock would fire the whole cue at once
    // whenever it did start.
    if (audio.state !== "running") return;

    scheduleProjectorCue(audio, audio.currentTime);
  } catch {
    // Audio is decoration on top of a notification that has already arrived.
    // Nothing here is worth surfacing to anyone.
  }
}
