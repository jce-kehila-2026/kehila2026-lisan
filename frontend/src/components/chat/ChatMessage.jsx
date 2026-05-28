/**
 * ChatMessage.jsx
 *
 * Renders a single chat bubble (user or assistant).
 *
 * RTL: textHe and textAr are always rendered with dir="rtl".
 * The bubble layout itself is LTR so that the avatar + label
 * appear on the correct side; only the text content is RTL.
 *
 * Fallback notice: when fallbackUsed is true (AI was unavailable and
 * a cached/static response was served) a small inline label is shown
 * so the student is aware the answer may be generic.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Bot, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { bubbleMotion } from '../ui/motion.js';

// Maps backend fallbackReason codes to human-readable i18n keys
const REASON_KEY_MAP = {
  MODEL_TIMEOUT:        'fallbackReasonTimeout',
  SERVICE_UNAVAILABLE:  'fallbackReasonUnavailable',
  OUT_OF_SCOPE:         'fallbackReasonOutOfScope',
  CACHE_HIT:            'fallbackReasonCache',
};

function ChatMessage({
  role,
  textHe,
  textAr = null,
  pending = false,
  fallbackUsed = false,
  fallbackReason = null,
}) {
  const { t } = useTranslation();
  const isUser = role === 'user';

  return (
    <motion.article
      className={`chat-message ${isUser ? 'chat-message--user' : 'chat-message--assistant'}`}
      aria-busy={pending}
      variants={bubbleMotion}
      initial="initial"
      animate="animate"
    >
      <div className={`chat-message__bubble${fallbackUsed ? ' chat-message__bubble--fallback' : ''}`}>
        {/* Avatar + sender label */}
        <div className="chat-message__meta">
          <span className={`chat-message__avatar${isUser ? ' is-user' : ' is-assistant'}`} aria-hidden="true">
            {isUser
              ? <UserRound className="h-4 w-4" aria-hidden="true" />
              : <Bot className="h-4 w-4" aria-hidden="true" />}
          </span>
          <span className="chat-message__label">
            {isUser ? t('chatYouLabel') : t('chatAssistantLabel')}
          </span>
        </div>

        {/* Primary Hebrew text — always RTL */}
        {textHe ? (
          <p className="chat-message__text" dir="rtl" lang="he">
            {textHe}
          </p>
        ) : null}

        {/* Arabic translation — only shown when backend returned it */}
        {textAr ? (
          <p className="chat-message__translation" dir="rtl" lang="ar">
            {textAr}
          </p>
        ) : null}

        {/* Typing / pending dots */}
        {pending ? (
          <span className="chat-message__pending" aria-label="…">...</span>
        ) : null}

        {/* Fallback badge — non-intrusive, shown only on assistant messages */}
        {!pending && !isUser && fallbackUsed ? (
          <span className="chat-message__fallback-notice" role="note">
            <span className="chat-message__fallback-dot" aria-hidden="true" />
            {fallbackReason && REASON_KEY_MAP[fallbackReason]
              ? t(REASON_KEY_MAP[fallbackReason])
              : t('chatFallbackNotice')}
          </span>
        ) : null}
      </div>
    </motion.article>
  );
}

export default ChatMessage;
