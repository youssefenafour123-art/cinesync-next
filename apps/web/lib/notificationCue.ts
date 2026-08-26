"use client";

import { useSourcesStore } from "@/store/useSourcesStore";

/**
 * The sound a notification makes.
 *
 * Synthesised with the Web Audio API rather than shipped as a file, for three
 * reasons: an mp3 is a request and a cache entry for 700ms of audio; a
 * recognisable cue from a streaming service is somebody's registered sound
 * mark and not ours to borrow; and the shape of it is easier to tune here than
 * in an audio editor.
 *
 * What it plays is the cinema idea rather than any particular cinema's: a low
 * hit that drops in pitch like a struck drum in a trailer, and a fifth
 * ringing above it a beat later. Around 700ms end to end, quiet enough to sit
 * under whatever else is happening.
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

    const t = audio.currentTime;

    /*
       One filter for the whole cue, so it reads as warm rather than as two
       beeps. 2.6kHz keeps the shimmer bright without any of it becoming
       sharp on laptop speakers, which exaggerate that range.
    */
    const shape = audio.createBiquadFilter();
    shape.type = "lowpass";
    shape.frequency.value = 2600;

    const master = audio.createGain();
    master.gain.value = 0.55;
    shape.connect(master);
    master.connect(audio.destination);

    // The hit: 110Hz falling to 55Hz, which is the drop that reads as weight
    // rather than as a low beep.
    const hit = audio.createOscillator();
    hit.type = "sine";
    hit.frequency.setValueAtTime(110, t);
    hit.frequency.exponentialRampToValueAtTime(55, t + 0.28);

    const hitLevel = audio.createGain();
    // Ramps from near-silence rather than from zero: `exponentialRampToValue`
    // cannot start at 0, and a linear attack on a sine this low clicks.
    hitLevel.gain.setValueAtTime(0.0001, t);
    hitLevel.gain.exponentialRampToValueAtTime(0.34, t + 0.015);
    hitLevel.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);

    hit.connect(hitLevel);
    hitLevel.connect(shape);
    hit.start(t);
    hit.stop(t + 0.55);

    /*
       The shimmer: E5 and the B5 a fifth above it, entering just behind the
       hit. A fifth rather than an octave — an octave doubles the same note and
       lands as a single brighter tone, where the fifth is the interval that
       sounds like an announcement.
    */
    for (const [freq, level, delay] of [
      [659.25, 0.1, 0.07],
      [987.77, 0.055, 0.09],
    ] as const) {
      const tone = audio.createOscillator();
      tone.type = "triangle";
      tone.frequency.value = freq;

      const toneLevel = audio.createGain();
      toneLevel.gain.setValueAtTime(0.0001, t + delay);
      toneLevel.gain.exponentialRampToValueAtTime(level, t + delay + 0.03);
      toneLevel.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.6);

      tone.connect(toneLevel);
      toneLevel.connect(shape);
      tone.start(t + delay);
      tone.stop(t + delay + 0.65);
    }
  } catch {
    // Audio is decoration on top of a notification that has already arrived.
    // Nothing here is worth surfacing to anyone.
  }
}
