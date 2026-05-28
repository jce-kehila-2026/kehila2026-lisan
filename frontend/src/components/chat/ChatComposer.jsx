import React, { useEffect, useRef } from 'react';
import { Mic, SendHorizontal, Square } from 'lucide-react';
import { motion } from 'framer-motion';

const MAX_ROWS = 5;
const LINE_HEIGHT = 24;

function ChatComposer({
  value,
  disabled = false,
  loading = false,
  includeArabic = false,
  onChange,
  onSubmit,
  onToggleArabic,
  onVoiceToggle,
  placeholder,
  sendLabel,
  arabicToggleLabel,
  voiceLabel,
  voiceStatusLabel = '',
  voiceState = 'idle',
  voiceSupported = false,
}) {
  const textareaRef = useRef(null);
  const isRecording = voiceState === 'recording';
  const isVoiceBusy = voiceState === 'requesting' || voiceState === 'stopping';
  const isDisabled = disabled || loading || isVoiceBusy;
  const canSend = !isDisabled && !isRecording && value.trim().length > 0;
  const canToggleVoice = voiceSupported && !loading && (isRecording || !isVoiceBusy);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, LINE_HEIGHT * MAX_ROWS + 24)}px`;
  }, [value]);

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (canSend) onSubmit();
    }
  };

  return (
    <motion.section
      className="chat-composer ui-card ui-card--padded"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36 }}
    >
      <div className="chat-composer__toolbar">
        <button
          type="button"
          role="switch"
          aria-checked={includeArabic}
          onClick={onToggleArabic}
          disabled={isDisabled}
          className={`chat-composer__arabic-toggle${includeArabic ? ' is-on' : ''}`}
        >
          <span className="chat-composer__toggle-track" aria-hidden="true">
            <span className="chat-composer__toggle-thumb" />
          </span>
          <span className="chat-composer__toggle-label">{arabicToggleLabel}</span>
        </button>
      </div>

      <div className="chat-composer__controls">
        <label htmlFor="chat-composer-input" className="sr-only">
          {placeholder}
        </label>
        <textarea
          ref={textareaRef}
          id="chat-composer-input"
          value={value}
          disabled={isDisabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          className="chat-composer__input"
          placeholder={placeholder}
          dir="rtl"
          rows={1}
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          aria-disabled={isDisabled}
        />

        <div className="chat-composer__actions">
          <button
            type="button"
            onClick={onVoiceToggle}
            disabled={!canToggleVoice}
            className={`chat-composer__voice${isRecording ? ' is-recording' : ''}${!voiceSupported ? ' is-unsupported' : ''}`}
            aria-label={voiceStatusLabel || voiceLabel}
            title={voiceStatusLabel || voiceLabel}
          >
            <span className="chat-composer__voice-ring" aria-hidden="true" />
            {isRecording ? (
              <Square className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Mic className="h-5 w-5" aria-hidden="true" />
            )}
          </button>

          <motion.button
            type="button"
            onClick={() => canSend && onSubmit()}
            disabled={!canSend}
            className={`chat-composer__send${canSend ? '' : ' is-disabled'}`}
            aria-label={sendLabel}
            title={sendLabel}
            whileHover={canSend ? { y: -2 } : {}}
            whileTap={canSend ? { scale: 0.97 } : {}}
          >
            <SendHorizontal className="h-5 w-5" aria-hidden="true" />
          </motion.button>
        </div>
      </div>

      <div className="chat-composer__voice-status" aria-live="polite">
        {voiceStatusLabel}
      </div>
    </motion.section>
  );
}

export default ChatComposer;
