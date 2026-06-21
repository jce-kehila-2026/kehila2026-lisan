import React, { useEffect, useRef } from 'react';
import { SendHorizontal } from 'lucide-react';
import { motion } from 'framer-motion';

const MAX_ROWS = 5;
const LINE_HEIGHT = 26;

/**
 * ChatComposer — text input for the chatbot's "טקסט" mode.
 *
 * Voice capture lives in its own modes (הודעה קולית / שיחה חופשית) rendered by
 * ChatbotPage via <VoiceConsole>, so this component stays focused on typing.
 */
function ChatComposer({
  value,
  disabled = false,
  loading = false,
  onChange,
  onSubmit,
  placeholder,
  sendLabel,
}) {
  const textareaRef = useRef(null);
  const isDisabled = disabled || loading;
  const canSend = !isDisabled && value.trim().length > 0;

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
    <motion.div
      className="chat-composer"
      dir="rtl"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="chat-composer__bar">
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

        <motion.button
          type="button"
          onClick={() => canSend && onSubmit()}
          disabled={!canSend}
          className={`chat-composer__send${canSend ? '' : ' is-disabled'}`}
          aria-label={sendLabel}
          title={sendLabel}
          whileHover={canSend ? { y: -2 } : {}}
          whileTap={canSend ? { scale: 0.96 } : {}}
        >
          <SendHorizontal className="h-5 w-5" aria-hidden="true" />
        </motion.button>
      </div>
    </motion.div>
  );
}

export default ChatComposer;
