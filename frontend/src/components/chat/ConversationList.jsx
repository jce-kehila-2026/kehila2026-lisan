/**
 * ConversationList.jsx
 *
 * Pure presentational list — renders conversation summaries with:
 *   • Active highlight on the currently open conversation
 *   • Delete button with a two-step confirm (first click → confirm state,
 *     second click → calls onDelete; clicking away resets)
 *   • RTL text direction on previews (Hebrew/Arabic)
 *   • Relative timestamp display (today = time, older = date)
 *   • Loading skeleton and empty state
 */

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquareText, Trash2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cardLift, sectionStagger } from '../ui/motion.js';

// ── Timestamp helper ──────────────────────────────────────────────────────────
function formatTimestamp(isoString, language) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    const locale = language === 'he' ? 'he-IL' : 'ar';

    return isToday
      ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}

// ── Skeleton row ──────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <li className="conversation-list__skeleton">
      <span className="conversation-list__skeleton-icon" />
      <span className="conversation-list__skeleton-lines">
        <span className="conversation-list__skeleton-line conversation-list__skeleton-line--title" />
        <span className="conversation-list__skeleton-line conversation-list__skeleton-line--preview" />
      </span>
    </li>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function ConversationList({
  conversations,
  activeConversationId = null,
  loading = false,
  loadingLabel,
  onSelect,
  onDelete,
  emptyLabel,
  deleteLabel,
  cancelDeleteLabel,
}) {
  const { i18n } = useTranslation();
  // Track which conversation is in "confirm-delete" state
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const handleDeleteClick = (e, id) => {
    e.stopPropagation();
    if (pendingDeleteId === id) {
      // Second click = confirmed
      onDelete(id);
      setPendingDeleteId(null);
    } else {
      setPendingDeleteId(id);
    }
  };

  const handleCancelDelete = (e) => {
    e.stopPropagation();
    setPendingDeleteId(null);
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <ul className="conversation-list__items" aria-label={loadingLabel}>
        {[1, 2, 3].map((n) => <SkeletonRow key={n} />)}
      </ul>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!conversations || conversations.length === 0) {
    return (
      <p className="conversation-list__status" role="status">
        {emptyLabel}
      </p>
    );
  }

  // ── List ───────────────────────────────────────────────────────────────────
  return (
    <motion.ul
      className="conversation-list__items"
      variants={sectionStagger}
      initial="initial"
      animate="animate"
      role="list"
    >
      {conversations.map((conversation) => {
        const isActive    = conversation.id === activeConversationId;
        const isPendingDel = conversation.id === pendingDeleteId;

        return (
          <motion.li key={conversation.id} variants={cardLift}>
            <div
              className={`conversation-list__item${isActive ? ' is-active' : ''}${isPendingDel ? ' is-pending-delete' : ''}`}
            >
              {/* Select button — covers most of the row */}
              <button
                type="button"
                className="conversation-list__select"
                onClick={() => {
                  setPendingDeleteId(null);
                  onSelect(conversation.id);
                }}
                aria-current={isActive ? 'true' : undefined}
              >
                <span className="conversation-list__icon" aria-hidden="true">
                  <MessageSquareText className="h-4 w-4" />
                </span>
                <span className="conversation-list__content">
                  <span className="conversation-list__title-row">
                    <strong className="conversation-list__title">{conversation.title}</strong>
                    <span className="conversation-list__time" dir="ltr">
                      {formatTimestamp(conversation.updatedAt || conversation.lastMessageAt, i18n.language)}
                    </span>
                  </span>
                  {conversation.lastMessagePreview ? (
                    <span className="conversation-list__preview" dir="auto">
                      {conversation.lastMessagePreview}
                    </span>
                  ) : null}
                </span>
              </button>

              {/* Delete / confirm-delete */}
              <AnimatePresence mode="wait">
                {isPendingDel ? (
                  // Confirm state: show ✓ confirm + × cancel
                  <motion.span
                    key="confirm"
                    className="conversation-list__delete-confirm"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ duration: 0.15 }}
                  >
                    <button
                      type="button"
                      className="conversation-list__delete-yes"
                      onClick={(e) => handleDeleteClick(e, conversation.id)}
                      aria-label={deleteLabel}
                    >
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="conversation-list__delete-cancel"
                      onClick={handleCancelDelete}
                      aria-label={cancelDeleteLabel}
                    >
                      ×
                    </button>
                  </motion.span>
                ) : (
                  // Default state: single trash icon
                  <motion.button
                    key="trash"
                    type="button"
                    className="conversation-list__delete"
                    onClick={(e) => handleDeleteClick(e, conversation.id)}
                    aria-label={`${deleteLabel || 'Delete'}: ${conversation.title}`}
                    title={`${deleteLabel || 'Delete'}: ${conversation.title}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}

export default ConversationList;
