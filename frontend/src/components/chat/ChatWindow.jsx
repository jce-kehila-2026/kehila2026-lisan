/**
 * ChatWindow.jsx
 *
 * Renders the scrollable list of messages + typing indicator.
 *
 * Auto-scroll behaviour
 * ─────────────────────
 * An internal `bottomRef` div is rendered after the last message / typing
 * indicator. A useEffect watches [messages, loading] and calls
 * scrollIntoView({ behavior: 'smooth' }) so the viewport tracks the latest
 * content automatically — both on send and on receive.
 *
 * RTL
 * ───
 * dir="rtl" is applied at the section level so Hebrew/Arabic wraps correctly
 * without needing per-element overrides (individual nodes can still override
 * with dir="ltr" if needed).
 */

import React, { useLayoutEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ChatMessage from './ChatMessage.jsx';
import ChatEmptyState from './ChatEmptyState.jsx';
import { cardLift, sectionStagger } from '../ui/motion.js';

function ChatWindow({
  messages,
  loading = false,
  loadingLabel = 'Loading…',
  emptyTitle,
  emptyDescription,
  emptyPrompts = [],
  onPromptClick,
}) {
  const bottomRef = useRef(null);

  // Auto-scroll to bottom whenever messages change or the typing indicator
  // appears/disappears.
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });

    return () => cancelAnimationFrame(frame);
  }, [messages, loading]);

  if (messages.length === 0 && !loading) {
    return (
      <ChatEmptyState
        title={emptyTitle}
        description={emptyDescription}
        prompts={emptyPrompts}
        onPromptClick={onPromptClick}
      />
    );
  }

  return (
    <motion.section
      className="chat-window"
      dir="rtl"
      aria-live="polite"
      aria-label={loadingLabel}
      variants={sectionStagger}
      initial="initial"
      animate="animate"
    >
      <AnimatePresence initial={false}>
        {messages.map((message) => (
          <ChatMessage
            key={message.localId}
            role={message.role}
            textHe={message.textHe}
            textAr={message.textAr}
            pending={message.pending}
            fallbackUsed={message.fallbackUsed}
            fallbackReason={message.fallbackReason}
          />
        ))}
      </AnimatePresence>

      {/* Typing / loading indicator */}
      <AnimatePresence>
        {loading ? (
          <motion.div
            className="chat-window__typing"
            role="status"
            aria-label={loadingLabel}
            variants={cardLift}
            initial="initial"
            animate="animate"
            exit={{ opacity: 0, y: 8, transition: { duration: 0.18 } }}
          >
            {/* Three animated dots */}
            <div className="chat-window__typing-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <span className="chat-window__typing-label">{loadingLabel}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Zero-height anchor — scrolled into view on every update */}
      <div ref={bottomRef} aria-hidden="true" />
    </motion.section>
  );
}

export default ChatWindow;
