import { useCallback, useRef, useState } from 'react';

// Synthesized game sounds via the Web Audio API — no audio files needed.
// Returns play helpers plus a muted flag and toggle. Sound is on by default.
export function useGameSounds() {
  const ctxRef = useRef(null);
  const [muted, setMuted] = useState(false);

  const getCtx = useCallback(() => {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctxRef.current) ctxRef.current = new AudioCtx();
    // browsers suspend audio until a user gesture; resume on demand
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const tone = useCallback((c, freq, start, dur, type, gain) => {
    const t = c.currentTime + start;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain || 0.18, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }, []);

  const slide = useCallback((c, f1, f2, start, dur, type, gain) => {
    const t = c.currentTime + start;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain || 0.14, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }, []);

  const play = useCallback(
    (name) => {
      if (muted) return;
      const c = getCtx();
      if (!c) return;
      try {
        if (name === 'flip') {
          slide(c, 420, 760, 0, 0.16, 'sine', 0.12);
        } else if (name === 'correct') {
          tone(c, 660, 0, 0.12, 'triangle', 0.16);
          tone(c, 880, 0.1, 0.18, 'triangle', 0.16);
        } else if (name === 'wrong') {
          tone(c, 196, 0, 0.2, 'sawtooth', 0.1);
          tone(c, 165, 0.04, 0.22, 'sawtooth', 0.08);
        } else if (name === 'streak') {
          [523, 659, 784, 1047].forEach((f, i) => tone(c, f, i * 0.07, 0.16, 'triangle', 0.13));
        } else if (name === 'finish') {
          [523, 659, 784].forEach((f, i) => tone(c, f, i * 0.1, 0.2, 'triangle', 0.15));
          tone(c, 1047, 0.32, 0.4, 'triangle', 0.16);
          tone(c, 784, 0.32, 0.4, 'sine', 0.08);
        }
      } catch {
        // ignore audio errors (autoplay restrictions, etc.)
      }
    },
    [muted, getCtx, tone, slide],
  );

  const toggleMuted = useCallback(() => setMuted((m) => !m), []);

  return { play, muted, toggleMuted };
}

export default useGameSounds;
