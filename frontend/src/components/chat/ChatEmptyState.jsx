/**
 * ChatEmptyState.jsx  —  Sprint 9
 *
 * Suggested Prompts behaviour
 * ───────────────────────────
 * Each prompt button calls onPromptClick(promptText) directly.
 * In ChatbotPage, submitMessage() accepts a pre-filled string arg,
 * so clicking a prompt fires the full send pipeline immediately —
 * no extra click, no text copied to the composer first.
 *
 * Three categories of prompts are shown:
 *   • Greeting    — open a natural Hebrew conversation
 *   • Vocabulary  — ask for a word/phrase
 *   • Practice    — request a short exercise
 *
 * Visual design: pill-shaped buttons, subtle hover lift, icon prefix.
 * The prompts are rendered with dir="rtl" for correct Hebrew display.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { BookOpen, MessageCircle, Sparkles, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cardLift, sectionStagger } from '../ui/motion.js';

// Three quick-start prompts — Hebrew text, category icon, i18n hint key
const QUICK_PROMPTS = [
  { text: 'שלום! מי את?',           icon: MessageCircle, hintKey: 'promptHintGreeting'   },
  { text: 'איך אומרים "תודה"?',      icon: BookOpen,      hintKey: 'promptHintVocab'      },
  { text: 'תני לי משפט קצר לתרגל.', icon: Zap,           hintKey: 'promptHintPractice'   },
];

function ChatEmptyState({ title, description, prompts = [], onPromptClick }) {
  const { t } = useTranslation();

  // Prefer the curated QUICK_PROMPTS; fall back to whatever the parent passes
  const displayPrompts = QUICK_PROMPTS.length > 0 ? QUICK_PROMPTS : prompts.map((p) => ({ text: p }));

  return (
    <motion.section
      className="chat-empty-state ui-card ui-card--padded"
      variants={sectionStagger}
      initial="initial"
      animate="animate"
      aria-label={title}
    >
      {/* Badge */}
      <motion.div className="chat-empty-state__badge" variants={cardLift}>
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{t('chatHeroBadge')}</span>
      </motion.div>

      {/* Title + description */}
      <motion.h2 className="chat-empty-state__title" variants={cardLift}>
        {title}
      </motion.h2>
      <motion.p className="chat-empty-state__description" variants={cardLift}>
        {description}
      </motion.p>

      {/* Quick-start prompts — clicking sends immediately */}
      <motion.div
        className="chat-empty-state__prompts"
        variants={sectionStagger}
        role="list"
        aria-label={t('chatQuickPromptsLabel')}
      >
        {displayPrompts.map((prompt) => {
          const Icon = prompt.icon || MessageCircle;
          return (
            <motion.button
              key={prompt.text}
              type="button"
              role="listitem"
              className="chat-empty-state__prompt"
              variants={cardLift}
              whileHover={{ y: -2, transition: { duration: 0.14 } }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onPromptClick(prompt.text)}
              title={prompt.hintKey ? t(prompt.hintKey) : prompt.text}
            >
              <Icon className="chat-empty-state__prompt-icon" aria-hidden="true" />
              <span dir="rtl" lang="he">{prompt.text}</span>
            </motion.button>
          );
        })}
      </motion.div>
    </motion.section>
  );
}

export default ChatEmptyState;
