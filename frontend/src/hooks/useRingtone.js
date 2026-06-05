/**
 * useRingtone
 *
 * Generates a looping two-tone phone ringtone via the Web Audio API.
 * No audio files required — tones are synthesised on the fly.
 * Also triggers device vibration on Android via navigator.vibrate().
 *
 * Usage:
 *   const { startRinging, stopRinging } = useRingtone();
 */
import { useRef, useCallback, useEffect } from 'react';

// ── Singleton AudioContext ────────────────────────────────────────────────────
// One context shared across all hook instances for the app's lifetime.
// Creating multiple AudioContexts triggers browser warnings.
let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

// Android WebView blocks audio until a user gesture has been received.
// Attach unlock listeners immediately when this module is first imported
// so the context is warm by the time the ring is triggered.
function setupUnlockOnGesture() {
  const unlock = () => {
    try {
      const ctx = getAudioCtx();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (_) { /* ignore */ }
  };
  document.addEventListener('touchstart', unlock, { once: true, capture: true });
  document.addEventListener('click',      unlock, { once: true, capture: true });
}
setupUnlockOnGesture();

// ── Ring tone parameters ──────────────────────────────────────────────────────
const FREQ_A         = 480;  // Hz — classic dual-tone North-American ring
const FREQ_B         = 620;  // Hz
const RING_SECS      = 2;    // seconds of audible ring per burst
const SILENCE_SECS   = 4;    // seconds of silence between bursts
const MASTER_GAIN    = 0.28; // volume 0–1

// Vibration pattern mirrors audio: 2 s on / 4 s off, repeated 5 times
const VIBRATE_PATTERN = [2000, 4000, 2000, 4000, 2000, 4000, 2000, 4000, 2000];

// ── Internal burst scheduler ──────────────────────────────────────────────────
function playBurst(ctx, oscillatorsRef) {
  const now = ctx.currentTime;

  [FREQ_A, FREQ_B].forEach((freq) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type          = 'sine';
    osc.frequency.value = freq;

    // Smooth envelope: fast fade-in → hold → fast fade-out (avoids clicks)
    gain.gain.setValueAtTime(0,           now);
    gain.gain.linearRampToValueAtTime(MASTER_GAIN, now + 0.06);
    gain.gain.setValueAtTime(MASTER_GAIN, now + RING_SECS - 0.06);
    gain.gain.linearRampToValueAtTime(0,  now + RING_SECS);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + RING_SECS);

    oscillatorsRef.current.push(osc);
  });
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useRingtone() {
  const isRingingRef   = useRef(false);
  const timerRef       = useRef(null);
  const oscillatorsRef = useRef([]);

  const stopRinging = useCallback(() => {
    isRingingRef.current = false;
    clearTimeout(timerRef.current);

    oscillatorsRef.current.forEach((osc) => {
      try { osc.stop(); } catch (_) { /* already stopped */ }
    });
    oscillatorsRef.current = [];

    if ('vibrate' in navigator) navigator.vibrate(0); // cancel vibration
  }, []);

  // Loop function stored in a ref so the setTimeout callback always has
  // the latest version without creating a stale closure.
  const ringLoopRef = useRef(null);
  ringLoopRef.current = () => {
    if (!isRingingRef.current) return;

    oscillatorsRef.current = []; // previous burst nodes have auto-stopped
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    playBurst(ctx, oscillatorsRef);

    timerRef.current = setTimeout(
      () => ringLoopRef.current?.(),
      (RING_SECS + SILENCE_SECS) * 1000,
    );
  };

  const startRinging = useCallback(() => {
    if (isRingingRef.current) return; // already ringing — no-op
    isRingingRef.current = true;

    ringLoopRef.current();

    if ('vibrate' in navigator) navigator.vibrate(VIBRATE_PATTERN);
  }, []);

  // Always clean up on unmount
  useEffect(() => () => stopRinging(), [stopRinging]);

  return { startRinging, stopRinging };
}
