/**
 * ConversationSidebar.jsx
 *
 * Responsive conversation history drawer.
 *
 * Layout strategy
 * ───────────────
 * The sidebar is always rendered in the DOM so AnimatePresence can handle
 * mount/unmount transitions. Visibility is controlled by the `open` prop.
 *
 * Mobile  (< 640 px)
 *   – Full-height drawer that slides in from the right edge
 *   – A semi-transparent backdrop covers the chat content
 *   – Tapping the backdrop or the × button closes the drawer
 *   – Implemented with framer-motion spring so it feels native
 *
 * Desktop (≥ 640 px)
 *   – Same drawer behaviour; the page is narrow enough (max-w-xl) that a
 *     permanent side-panel would crowd the chat, so the drawer pattern is
 *     used on all breakpoints.
 *
 * Integration with ChatbotPage
 * ────────────────────────────
 * ChatbotPage owns `sidebarOpen` state and passes it here.
 * ConversationSidebar is rendered at the root of ChatbotPage's JSX tree
 * (below everything else) so it overlays all content via `position: fixed`.
 * The page never scrolls while the sidebar is open (overflow is locked via
 * the `conversation-sidebar__backdrop` overlay).
 *
 * Props
 * ─────
 *  open                  boolean   – whether the drawer is visible
 *  onClose               fn        – called when the drawer should close
 *  conversations         array     – list from fetchConversations()
 *  activeConversationId  string|null
 *  loading               boolean
 *  onNewChat             fn        – resets conversationId + messages in parent
 *  onSelectConversation  fn(id)    – loads a conversation
 *  onDeleteConversation  fn(id)    – soft-deletes a conversation
 *  title / subtitle / loadingLabel / newChatLabel / emptyLabel / deleteLabel
 *    All labels are passed from ChatbotPage (translated via useTranslation)
 *    so this component stays label-agnostic and works in both Hebrew and Arabic.
 */

import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquarePlus, X } from 'lucide-react';
import ConversationList from './ConversationList.jsx';

// Spring config matching the existing page transitions
const DRAWER_SPRING = { type: 'spring', damping: 28, stiffness: 220 };

function ConversationSidebar({
  open = false,
  onClose,
  conversations = [],
  activeConversationId = null,
  loading = false,
  title,
  subtitle,
  loadingLabel,
  newChatLabel,
  emptyLabel,
  deleteLabel,
  closeLabel,
  cancelDeleteLabel,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
}) {
  // Lock body scroll while drawer is open so the chat behind doesn't drift
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const handleNewChat = () => {
    onNewChat();
    onClose();
  };

  const handleSelect = (id) => {
    onSelectConversation(id);
    onClose();
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          {/* ── Backdrop ─────────────────────────────────────────────── */}
          <motion.div
            className="conversation-sidebar__backdrop"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
          />

          {/* ── Drawer panel ─────────────────────────────────────────── */}
          <motion.aside
            className="conversation-sidebar"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={DRAWER_SPRING}
          >
            {/* Header */}
            <div className="conversation-sidebar__header">
              <div className="conversation-sidebar__header-text">
                <h2 className="conversation-sidebar__title">{title}</h2>
                {subtitle ? (
                  <p className="conversation-sidebar__subtitle">{subtitle}</p>
                ) : null}
              </div>
              <button
                type="button"
                className="conversation-sidebar__close"
                onClick={onClose}
                aria-label={closeLabel}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* New-chat action */}
            <div className="conversation-sidebar__new-chat">
              <button
                type="button"
                className="conversation-sidebar__new-btn"
                onClick={handleNewChat}
                disabled={loading}
              >
                <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
                {newChatLabel}
              </button>
            </div>

            {/* Scrollable conversation list */}
            <div className="conversation-sidebar__body">
              <ConversationList
                conversations={conversations}
                activeConversationId={activeConversationId}
                loading={loading}
                loadingLabel={loadingLabel}
                onSelect={handleSelect}
                onDelete={onDeleteConversation}
                emptyLabel={emptyLabel}
                deleteLabel={deleteLabel}
                cancelDeleteLabel={cancelDeleteLabel}
              />
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

export default ConversationSidebar;
