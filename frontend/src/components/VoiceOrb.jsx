import React, { useId } from 'react';

const ARIA_LABELS = {
  idle: 'התחל להקליט',
  listening: 'הקלטה פעילה',
  thinking: 'מעבד',
  speaking: 'מדבר',
};

/**
 * VoiceOrb — a glowing animated violet sphere that reflects voice-interaction
 * state. Purely presentational; wire onClick externally.
 *
 * Props:
 *   state    – 'idle' | 'listening' | 'thinking' | 'speaking'  (default 'idle')
 *   onClick  – optional click handler
 *   size     – diameter in px (default 150)
 */
function VoiceOrb({ state = 'idle', onClick, size = 150 }) {
  const styleId = useId();

  const css = `
    /* ── keyframes ─────────────────────────────────────── */
    @keyframes vo-breathe-slow {
      0%, 100% { transform: scale(1); }
      50%      { transform: scale(1.05); }
    }
    @keyframes vo-breathe-fast {
      0%, 100% { transform: scale(1); }
      50%      { transform: scale(1.07); }
    }
    @keyframes vo-pulse-speaking {
      0%, 100% { transform: scale(1); }
      50%      { transform: scale(1.09); }
    }
    @keyframes vo-wobble {
      0%, 100% { transform: scale(1) rotate(0deg); }
      25%      { transform: scale(1.03) rotate(1.5deg); }
      50%      { transform: scale(1.05) rotate(0deg); }
      75%      { transform: scale(1.03) rotate(-1.5deg); }
    }
    @keyframes vo-sheen-slow {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    @keyframes vo-aura-pulse {
      0%, 100% { opacity: 0.35; transform: scale(1); }
      50%      { opacity: 0.55; transform: scale(1.12); }
    }
    @keyframes vo-aura-strong {
      0%, 100% { opacity: 0.45; transform: scale(1); }
      50%      { opacity: 0.75; transform: scale(1.18); }
    }
    @keyframes vo-ripple {
      0%   { transform: scale(1); opacity: 0.55; }
      100% { transform: scale(2.2); opacity: 0; }
    }

    /* ── base orb ──────────────────────────────────────── */
    .vo-root {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      -webkit-tap-highlight-color: transparent;
      outline: none;
    }
    .vo-root[data-clickable="true"] { cursor: pointer; }

    /* blurred aura */
    .vo-aura {
      position: absolute;
      inset: -18%;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(139,92,246,0.55) 0%, rgba(124,58,237,0.15) 60%, transparent 80%);
      filter: blur(18px);
      z-index: 0;
      animation: vo-aura-pulse 4.5s ease-in-out infinite;
    }

    /* sphere */
    .vo-sphere {
      position: relative;
      z-index: 1;
      border-radius: 50%;
      background:
        radial-gradient(circle at 32% 28%, rgba(255,255,255,0.55) 0%, transparent 38%),
        radial-gradient(circle at 50% 50%, #DDD6FE 0%, #C084FC 25%, #A855F7 55%, #7C3AED 78%, #5B21B6 100%);
      box-shadow:
        0 0 32px 8px rgba(124,58,237,0.45),
        inset 0 -6px 18px rgba(91,33,182,0.50),
        inset 0 4px 12px rgba(221,214,254,0.35);
      animation: vo-breathe-slow 4.5s ease-in-out infinite;
    }

    /* rotating sheen overlay */
    .vo-sheen {
      position: absolute;
      inset: 4%;
      border-radius: 50%;
      background: conic-gradient(
        from 0deg,
        rgba(167,139,250,0.12) 0%,
        rgba(192,132,252,0.18) 25%,
        rgba(236,72,153,0.10) 50%,
        rgba(129,140,248,0.14) 75%,
        rgba(167,139,250,0.12) 100%
      );
      mix-blend-mode: screen;
      z-index: 2;
      pointer-events: none;
      animation: vo-sheen-slow 8s linear infinite;
    }

    /* ── state: idle ───────────────────────────────────── */
    .vo-root[data-state="idle"] .vo-sphere {
      animation: vo-breathe-slow 4.5s ease-in-out infinite;
    }

    /* ── state: listening ──────────────────────────────── */
    .vo-root[data-state="listening"] .vo-sphere {
      animation: vo-breathe-fast 2.2s ease-in-out infinite;
      box-shadow:
        0 0 48px 14px rgba(124,58,237,0.6),
        inset 0 -6px 18px rgba(91,33,182,0.50),
        inset 0 4px 12px rgba(221,214,254,0.35);
    }
    .vo-root[data-state="listening"] .vo-aura {
      animation: vo-aura-strong 2.2s ease-in-out infinite;
    }
    .vo-root[data-state="listening"] .vo-sheen {
      animation: vo-sheen-slow 4s linear infinite;
    }

    /* ripple rings (listening only) */
    .vo-ripple {
      display: none;
      position: absolute;
      border-radius: 50%;
      border: 2px solid rgba(167,139,250,0.45);
      z-index: 0;
      pointer-events: none;
    }
    .vo-root[data-state="listening"] .vo-ripple {
      display: block;
      animation: vo-ripple 2.6s ease-out infinite;
    }
    .vo-root[data-state="listening"] .vo-ripple:nth-child(2) {
      animation-delay: 0.55s;
    }
    .vo-root[data-state="listening"] .vo-ripple:nth-child(3) {
      animation-delay: 1.1s;
    }

    /* ── state: thinking ───────────────────────────────── */
    .vo-root[data-state="thinking"] .vo-sphere {
      animation: vo-wobble 3s ease-in-out infinite;
    }
    .vo-root[data-state="thinking"] .vo-sheen {
      animation: vo-sheen-slow 2.4s linear infinite;
    }
    .vo-root[data-state="thinking"] .vo-aura {
      animation: vo-aura-pulse 3s ease-in-out infinite;
    }

    /* ── state: speaking ───────────────────────────────── */
    .vo-root[data-state="speaking"] .vo-sphere {
      animation: vo-pulse-speaking 0.55s ease-in-out infinite;
      box-shadow:
        0 0 56px 18px rgba(124,58,237,0.7),
        inset 0 -6px 18px rgba(91,33,182,0.50),
        inset 0 4px 12px rgba(221,214,254,0.35);
    }
    .vo-root[data-state="speaking"] .vo-aura {
      animation: vo-aura-strong 0.55s ease-in-out infinite;
    }
    .vo-root[data-state="speaking"] .vo-sheen {
      animation: vo-sheen-slow 3s linear infinite;
    }

    /* ── prefers-reduced-motion ────────────────────────── */
    @media (prefers-reduced-motion: reduce) {
      .vo-sphere,
      .vo-aura,
      .vo-sheen,
      .vo-ripple {
        animation: none !important;
      }
      .vo-ripple { display: none !important; }
    }
  `;

  const spherePx = size;
  const ripplePx = size * 0.92;

  return (
    <>
      <style>{css}</style>

      <div
        className="vo-root"
        data-state={state}
        data-clickable={onClick ? 'true' : 'false'}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label={ARIA_LABELS[state] || ARIA_LABELS.idle}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onClick(e);
                }
              }
            : undefined
        }
        style={{ width: spherePx, height: spherePx }}
      >
        {/* Aura glow */}
        <div className="vo-aura" />

        {/* 3 ripple rings (visible only in listening state via CSS) */}
        <div
          className="vo-ripple"
          style={{
            width: ripplePx,
            height: ripplePx,
            top: '50%',
            left: '50%',
            marginTop: -ripplePx / 2,
            marginLeft: -ripplePx / 2,
          }}
        />
        <div
          className="vo-ripple"
          style={{
            width: ripplePx,
            height: ripplePx,
            top: '50%',
            left: '50%',
            marginTop: -ripplePx / 2,
            marginLeft: -ripplePx / 2,
          }}
        />
        <div
          className="vo-ripple"
          style={{
            width: ripplePx,
            height: ripplePx,
            top: '50%',
            left: '50%',
            marginTop: -ripplePx / 2,
            marginLeft: -ripplePx / 2,
          }}
        />

        {/* Main sphere */}
        <div
          className="vo-sphere"
          style={{ width: spherePx, height: spherePx }}
        />

        {/* Rotating sheen */}
        <div className="vo-sheen" />
      </div>
    </>
  );
}

export default VoiceOrb;
