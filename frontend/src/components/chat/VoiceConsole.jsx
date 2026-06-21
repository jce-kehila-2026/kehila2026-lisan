import React from 'react';
import { Mic, Square } from 'lucide-react';

/**
 * VoiceConsole — the input surface for the two voice modes.
 *
 *   variant="voice" → a single mic button: record a one-shot voice message
 *                     (reply shown as text).
 *   variant="free"  → record a spoken turn and read the reply aloud.
 *
 * Both tap the same underlying recorder → sendVoiceMessage pipeline; the parent
 * decides whether the reply is spoken through the onTap handler.
 */
function VoiceConsole({
  variant = 'free',
  recording = false,
  busy = false,
  supported = true,
  caption = '',
  hint = '',
  onTap,
}) {
  const disabled = !supported || busy;
  const Icon = recording ? Square : Mic;

  return (
    <div className={`voice-console voice-console--${variant}`} dir="rtl">
      <button
        type="button"
        onClick={onTap}
        disabled={disabled}
        className={`voice-console__mic${recording ? ' is-recording' : ''}${variant === 'free' ? ' is-free' : ''}`}
        aria-label={caption || hint}
        aria-pressed={recording}
      >
        <span className="voice-console__mic-ring" aria-hidden="true" />
        <Icon className={recording ? 'h-5 w-5' : 'h-6 w-6'} aria-hidden="true" />
      </button>

      <p className="voice-console__caption" aria-live="polite">{caption}</p>
      {hint ? <p className="voice-console__hint">{hint}</p> : null}
    </div>
  );
}

export default VoiceConsole;
