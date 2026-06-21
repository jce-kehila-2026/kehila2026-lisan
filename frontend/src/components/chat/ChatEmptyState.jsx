/**
 * ChatEmptyState.jsx
 *
 * Shown when a conversation has no messages yet. It stays intentionally simple:
 * bot illustration, headline, and subtitle. The single mode selector lives in
 * the composer below this state.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { cardLift, sectionStagger } from '../ui/motion.js';

function RobotIllustration({ size = 150 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Floating decorative elements */}
      <circle cx="22" cy="38" r="8" fill="#EDE9FE" />
      <path d="M18 38h8M22 34v8" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round"/>
      <rect x="126" y="55" width="16" height="20" rx="4" fill="#EDE9FE"/>
      <path d="M130 59h8M130 63h8M130 67h5" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="134" cy="30" r="6" fill="#F3E8FF"/>
      <path d="M131 30l2 2 4-4" stroke="#7C3AED" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Antenna */}
      <line x1="80" y1="28" x2="80" y2="42" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="80" cy="24" r="5" fill="#7C3AED"/>
      {/* Head */}
      <rect x="52" y="42" width="56" height="44" rx="14" fill="#7C3AED"/>
      {/* Eyes */}
      <rect x="63" y="56" width="12" height="12" rx="6" fill="white"/>
      <circle cx="69" cy="62" r="4" fill="#4C1D95"/>
      <circle cx="71" cy="60" r="1.5" fill="white"/>
      <rect x="85" y="56" width="12" height="12" rx="6" fill="white"/>
      <circle cx="91" cy="62" r="4" fill="#4C1D95"/>
      <circle cx="93" cy="60" r="1.5" fill="white"/>
      {/* Mouth */}
      <rect x="68" y="74" width="24" height="6" rx="3" fill="#5B21B6"/>
      <rect x="72" y="75" width="6" height="4" rx="1" fill="#A78BFA"/>
      <rect x="82" y="75" width="6" height="4" rx="1" fill="#A78BFA"/>
      {/* Neck */}
      <rect x="74" y="86" width="12" height="8" rx="2" fill="#6D28D9"/>
      {/* Body */}
      <rect x="44" y="94" width="72" height="44" rx="16" fill="#8B5CF6"/>
      {/* Chest panel */}
      <rect x="58" y="104" width="44" height="24" rx="8" fill="#7C3AED"/>
      <circle cx="70" cy="116" r="6" fill="#A78BFA"/>
      <circle cx="70" cy="116" r="3" fill="#EDE9FE"/>
      <rect x="80" y="110" width="14" height="3" rx="1.5" fill="#A78BFA"/>
      <rect x="80" y="116" width="10" height="3" rx="1.5" fill="#A78BFA"/>
      <rect x="80" y="122" width="12" height="3" rx="1.5" fill="#A78BFA"/>
      {/* Arms */}
      <rect x="22" y="96" width="22" height="10" rx="5" fill="#8B5CF6"/>
      <rect x="116" y="96" width="22" height="10" rx="5" fill="#8B5CF6"/>
      {/* Left hand raised */}
      <rect x="18" y="80" width="10" height="18" rx="5" fill="#7C3AED"/>
      <circle cx="23" cy="78" r="6" fill="#8B5CF6"/>
      {/* Stars / sparkles */}
      <path d="M140 88l1.5 4.5L146 94l-4.5 1.5L140 100l-1.5-4.5L134 94l4.5-1.5z" fill="#DDD6FE"/>
      <path d="M28 118l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="#C4B5FD"/>
    </svg>
  );
}

function ChatEmptyState({ title, description }) {
  return (
    <motion.section
      className="chat-empty-state"
      variants={sectionStagger}
      initial="initial"
      animate="animate"
      aria-label={title}
    >
      {/* Friendly bot with a soft glow + floating sparkles */}
      <motion.div className="chat-empty-state__art" variants={cardLift}>
        <span className="chat-empty-state__glow" aria-hidden="true" />
        <span className="chat-empty-state__spark chat-empty-state__spark--1" aria-hidden="true" />
        <span className="chat-empty-state__spark chat-empty-state__spark--2" aria-hidden="true" />
        <span className="chat-empty-state__spark chat-empty-state__spark--3" aria-hidden="true" />
        <RobotIllustration size={150} />
      </motion.div>

      <motion.h2 className="chat-empty-state__title" variants={cardLift}>
        {title}
      </motion.h2>
      <motion.p className="chat-empty-state__description" variants={cardLift}>
        {description}
      </motion.p>

    </motion.section>
  );
}

export default ChatEmptyState;
