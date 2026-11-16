'use strict';

/**
 * aiReviewService.js — volunteer review of AI tutor conversations.
 *
 * Flow:
 *   reviewer flags an AI reply  -> aiReviewFlags (status 'pending')
 *   owner approves in admin      -> aiCorrections (active rule for a level)
 *   ai-service fetches the rules -> GET /api/internal/ai-corrections?level=
 *
 * Collections:
 *   aiReviewFlags        one doc per flag
 *   aiReviewStatus/{chatId}             per-conversation review summary
 *   aiReviewCompletions/{chatId}_{uid}  "reviewer X finished chat Y"
 *   aiCorrections        approved rules injected into the tutor prompt
 *
 * PRIVACY: nothing returned to reviewers may identify the student — no
 * name, email or uid. Students are shown by an opaque HMAC alias.
 */

const crypto = require('crypto');

const FLAG_CATEGORIES = Object.freeze([
  'hebrew_error',
  'wrong_level_too_hard',
  'wrong_translation',
  'inappropriate',
  'off_topic',
  'other',
]);

const REVIEW_STATUSES = Object.freeze(['unreviewed', 'reviewed', 'has_flags']);
const VALID_LEVELS = Object.freeze(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const RULE_LEVELS = Object.freeze([...VALID_LEVELS, 'ALL']);

const MAX_COMMENT_CHARS = 1000;
const MAX_RULE_CHARS = 300;
const MIN_RULE_CHARS = 5;
const PAGE_SIZE = 20;
const SCAN_BATCH = 40;
const MAX_SCAN_BATCHES = 5;
const MAX_ACTIVE_RULES = 50;

const CATEGORY_HINTS = Object.freeze({
  hebrew_error: 'Check Hebrew grammar, spelling and gender agreement carefully.',
  wrong_level_too_hard: 'Use simpler, shorter sentences and common words for this level.',
  wrong_translation: 'Double-check the meaning before translating to Arabic.',
  inappropriate: 'Never produce content like this; keep replies respectful and appropriate.',
  off_topic: "Stay on the learner's topic and the current lesson.",
  other: '',
});

function getDb() {
  return require('../config/firebase').db;
}

function httpError(status, code, error) {
  const err = new Error(error);
  err.status = status;
  err.code = code;
  return err;
}

function studentAlias(uid) {
  const secret = String(process.env.JWT_SECRET || '');
  return crypto
    .createHmac('sha256', secret)
    .update(`review-alias:${String(uid || '')}`)
    .digest('hex')
    .slice(0, 6);
}

function toIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value._seconds === 'number') return new Date(value._seconds * 1000).toISOString();
  return null;
}

function normalizeLevel(level) {
  const value = String(level || '').trim().toUpperCase();
  return VALID_LEVELS.includes(value) ? value : null;
}

function senderToRole(sender) {
  return sender === 'ai' || sender === 'assistant' ? 'ai' : 'student';
}

function messageText(message) {
  if (!message || typeof message !== 'object') return '';
  const text = message.text ?? message.transcribedText ?? '';
  return typeof text === 'string' ? text : '';
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  // Whitelist only — never copy audioUrl, clientMessageId, learnerName, etc.
  return messages.map((message, index) => ({
    index,
    role: senderToRole(message?.sender),
    text: messageText(message),
    type: message?.type === 'voice' ? 'voice' : 'text',
    timestamp: toIso(message?.createdAt),
  }));
}

function countAiMessages(messages) {
  return Array.isArray(messages)
    ? messages.filter((m) => senderToRole(m?.sender) === 'ai').length
    : 0;
}

function statusFromDoc(statusData) {
  if (!statusData) return 'unreviewed';
  if (Number(statusData.flagCount) > 0) return 'has_flags';
  if (Number(statusData.reviewCount) > 0) return 'reviewed';
  return 'unreviewed';
}

async function loadStatuses(db, chatIds) {
  const entries = await Promise.all(
    chatIds.map(async (id) => {
      const snap = await db.collection('aiReviewStatus').doc(id).get();
      return [id, snap.exists ? snap.data() : null];
    })
  );
  return new Map(entries);
}

function summarizeChat(doc, statusData) {
  const data = doc.data() || {};
  const messages = Array.isArray(data.messages) ? data.messages : [];
  return {
    id: doc.id,
    studentAlias: studentAlias(data.userId),
    level: normalizeLevel(data.level) || 'A1',
    date: toIso(data.updatedAt) || toIso(data.startedAt),
    messageCount: messages.length,
    reviewStatus: statusFromDoc(statusData),
    flagCount: Number(statusData?.flagCount) || 0,
  };
}

async function listConversations({ level, status, cursor, pageSize = PAGE_SIZE } = {}) {
  const db = getDb();
  const normalizedLevel = level ? normalizeLevel(level) : null;
  if (level && !normalizedLevel) {
    throw httpError(400, 'INVALID_LEVEL', 'Invalid level');
  }
  if (status && !REVIEW_STATUSES.includes(status)) {
    throw httpError(400, 'INVALID_STATUS', 'Invalid status');
  }

  let base = db.collection('chatSessions');
  if (normalizedLevel) base = base.where('level', '==', normalizedLevel);
  base = base.orderBy('updatedAt', 'desc');

  let startAfterDoc = null;
  if (cursor) {
    const cursorSnap = await db.collection('chatSessions').doc(String(cursor)).get();
    if (!cursorSnap.exists) {
      throw httpError(400, 'INVALID_CURSOR', 'Invalid cursor');
    }
    startAfterDoc = cursorSnap;
  }

  const items = [];
  let nextCursor = null;
  let exhausted = false;

  for (let batch = 0; batch < MAX_SCAN_BATCHES && items.length < pageSize; batch += 1) {
    let query = base;
    if (startAfterDoc) query = query.startAfter(startAfterDoc);
    const snapshot = await query.limit(SCAN_BATCH).get();
    const docs = snapshot.docs || [];
    if (docs.length < SCAN_BATCH) exhausted = true;

    const candidates = docs.filter((doc) => countAiMessages(doc.data()?.messages) > 0);
    const statuses = await loadStatuses(db, candidates.map((d) => d.id));

    let lastConsumed = null;
    for (const doc of docs) {
      lastConsumed = doc;
      if (!candidates.includes(doc)) continue;
      const summary = summarizeChat(doc, statuses.get(doc.id));
      if (status && summary.reviewStatus !== status) continue;
      items.push(summary);
      if (items.length >= pageSize) break;
    }

    if (lastConsumed) startAfterDoc = lastConsumed;
    if (items.length >= pageSize) {
      nextCursor = lastConsumed ? lastConsumed.id : null;
      // A full page that consumed the final doc of an exhausted scan is the end.
      if (exhausted && lastConsumed === docs[docs.length - 1]) nextCursor = null;
      break;
    }
    if (exhausted) break;
    if (batch === MAX_SCAN_BATCHES - 1 && startAfterDoc) {
      // Scan budget used up (heavy filtering) — let the client continue.
      nextCursor = startAfterDoc.id;
    }
  }

  return { conversations: items, nextCursor };
}

async function loadChatOr404(db, chatId) {
  const snap = await db.collection('chatSessions').doc(String(chatId)).get();
  if (!snap.exists) {
    throw httpError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
  }
  return snap;
}

async function getConversation(chatId, reviewerId) {
  const db = getDb();
  const snap = await loadChatOr404(db, chatId);
  const data = snap.data() || {};
  const statusSnap = await db.collection('aiReviewStatus').doc(snap.id).get();
  const statusData = statusSnap.exists ? statusSnap.data() : null;

  const myFlagsSnap = await db
    .collection('aiReviewFlags')
    .where('chatId', '==', snap.id)
    .get();
  const myFlags = [];
  myFlagsSnap.forEach((doc) => {
    const flag = doc.data() || {};
    if (flag.reviewerId !== reviewerId) return;
    myFlags.push({
      id: doc.id,
      messageIndex: flag.messageIndex,
      category: flag.category,
      comment: flag.comment,
      suggestedCorrection: flag.suggestedCorrection || '',
      status: flag.status,
    });
  });

  const completionSnap = await db
    .collection('aiReviewCompletions')
    .doc(`${snap.id}_${reviewerId}`)
    .get();

  return {
    id: snap.id,
    studentAlias: studentAlias(data.userId),
    level: normalizeLevel(data.level) || 'A1',
    date: toIso(data.updatedAt) || toIso(data.startedAt),
    reviewStatus: statusFromDoc(statusData),
    completedByMe: completionSnap.exists,
    messages: sanitizeMessages(data.messages),
    myFlags,
  };
}

function validateOptionalText(value, field) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') {
    throw httpError(400, 'INVALID_FIELD', `${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_COMMENT_CHARS) {
    throw httpError(400, 'FIELD_TOO_LONG', `${field} must be at most ${MAX_COMMENT_CHARS} characters`);
  }
  return trimmed;
}

function validateFlagInput(body) {
  const input = body && typeof body === 'object' ? body : {};
  const messageIndex = input.messageIndex;
  if (!Number.isInteger(messageIndex) || messageIndex < 0) {
    throw httpError(400, 'INVALID_MESSAGE_INDEX', 'messageIndex must be a non-negative integer');
  }
  if (!FLAG_CATEGORIES.includes(input.category)) {
    throw httpError(400, 'INVALID_CATEGORY', 'Invalid category');
  }
  if (typeof input.comment !== 'string' || !input.comment.trim()) {
    throw httpError(400, 'COMMENT_REQUIRED', 'comment is required');
  }
  const comment = validateOptionalText(input.comment, 'comment');
  const suggestedCorrection = validateOptionalText(input.suggestedCorrection, 'suggestedCorrection');
  return { messageIndex, category: input.category, comment, suggestedCorrection };
}

async function updateReviewStatus(db, chatId, level, patch) {
  const ref = db.collection('aiReviewStatus').doc(chatId);
  const snap = await ref.get();
  const current = snap.exists ? snap.data() || {} : {};
  const next = {
    chatId,
    level,
    flagCount: (Number(current.flagCount) || 0) + (patch.flagDelta || 0),
    reviewCount: (Number(current.reviewCount) || 0) + (patch.reviewDelta || 0),
    updatedAt: new Date(),
  };
  if (patch.reviewDelta) next.lastReviewedAt = new Date();
  await ref.set(next, { merge: true });
  return next;
}

async function createFlag(chatId, reviewerId, body) {
  const input = validateFlagInput(body);
  const db = getDb();
  const snap = await loadChatOr404(db, chatId);
  const data = snap.data() || {};
  const messages = Array.isArray(data.messages) ? data.messages : [];
  const target = messages[input.messageIndex];

  if (!target) {
    throw httpError(400, 'INVALID_MESSAGE_INDEX', 'messageIndex is out of range');
  }
  if (senderToRole(target.sender) !== 'ai') {
    throw httpError(400, 'NOT_AN_AI_MESSAGE', 'Only AI messages can be flagged');
  }

  let studentMessageText = '';
  for (let i = input.messageIndex - 1; i >= 0; i -= 1) {
    if (senderToRole(messages[i]?.sender) === 'student') {
      studentMessageText = messageText(messages[i]);
      break;
    }
  }

  const level = normalizeLevel(data.level) || 'A1';
  const flag = {
    chatId: snap.id,
    messageIndex: input.messageIndex,
    reviewerId,
    level,
    category: input.category,
    comment: input.comment,
    suggestedCorrection: input.suggestedCorrection,
    aiMessageText: messageText(target),
    studentMessageText,
    status: 'pending',
    createdAt: new Date(),
  };

  const ref = await db.collection('aiReviewFlags').add(flag);
  await updateReviewStatus(db, snap.id, level, { flagDelta: 1 });
  return { id: ref.id, ...flag, createdAt: flag.createdAt.toISOString() };
}

async function completeReview(chatId, reviewerId) {
  const db = getDb();
  const snap = await loadChatOr404(db, chatId);
  const level = normalizeLevel(snap.data()?.level) || 'A1';
  const completionRef = db.collection('aiReviewCompletions').doc(`${snap.id}_${reviewerId}`);
  const existing = await completionRef.get();

  const flagsSnap = await db.collection('aiReviewFlags').where('chatId', '==', snap.id).get();
  let myFlagCount = 0;
  flagsSnap.forEach((doc) => {
    if (doc.data()?.reviewerId === reviewerId) myFlagCount += 1;
  });

  await completionRef.set({
    chatId: snap.id,
    reviewerId,
    level,
    flagCount: myFlagCount,
    completedAt: new Date(),
  });

  const status = existing.exists
    ? await updateReviewStatus(db, snap.id, level, {})
    : await updateReviewStatus(db, snap.id, level, { reviewDelta: 1 });

  return { chatId: snap.id, reviewStatus: statusFromDoc(status), alreadyCompleted: existing.exists };
}

async function getReviewerStats(reviewerId) {
  const db = getDb();
  const [completions, flags] = await Promise.all([
    db.collection('aiReviewCompletions').where('reviewerId', '==', reviewerId).get(),
    db.collection('aiReviewFlags').where('reviewerId', '==', reviewerId).get(),
  ]);
  return {
    reviewedConversations: completions.size ?? (completions.docs || []).length,
    flagsSubmitted: flags.size ?? (flags.docs || []).length,
  };
}

// ── Owner approval queue ────────────────────────────────────────────────────

function deriveRuleText(flag) {
  const hint = CATEGORY_HINTS[flag.category] || '';
  const correction = String(flag.suggestedCorrection || '').trim();
  const aiSnippet = String(flag.aiMessageText || '').trim().slice(0, 80);
  let text = '';
  if (correction && aiSnippet) {
    text = `Instead of replying "${aiSnippet}", reply like: "${correction}". ${hint}`;
  } else if (correction) {
    text = `Reply like: "${correction}". ${hint}`;
  } else {
    text = `${hint} Reviewer note: ${String(flag.comment || '').trim()}`;
  }
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > MAX_RULE_CHARS ? `${text.slice(0, MAX_RULE_CHARS - 1)}…` : text;
}

async function listFeedback({ status = 'pending' } = {}) {
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    throw httpError(400, 'INVALID_STATUS', 'Invalid status');
  }
  const db = getDb();
  // Equality-only query (no composite index); sort newest first in memory.
  const snap = await db.collection('aiReviewFlags').where('status', '==', status).get();
  const flags = [];
  snap.forEach((doc) => {
    const data = doc.data() || {};
    flags.push({
      id: doc.id,
      chatId: data.chatId,
      messageIndex: data.messageIndex,
      level: data.level,
      category: data.category,
      comment: data.comment,
      suggestedCorrection: data.suggestedCorrection || '',
      aiMessageText: data.aiMessageText || '',
      studentMessageText: data.studentMessageText || '',
      reviewerId: data.reviewerId,
      status: data.status,
      createdAt: toIso(data.createdAt),
      suggestedRuleText: deriveRuleText(data),
    });
  });
  flags.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const limited = flags.slice(0, 200);

  const reviewerIds = [...new Set(limited.map((f) => f.reviewerId).filter(Boolean))];
  const names = new Map();
  await Promise.all(
    reviewerIds.map(async (id) => {
      const userSnap = await db.collection('users').doc(id).get();
      names.set(id, userSnap.exists ? userSnap.data()?.name || '' : '');
    })
  );
  return limited.map((flag) => ({ ...flag, reviewerName: names.get(flag.reviewerId) || '' }));
}

function validateRuleInput(body, fallbackLevel) {
  const input = body && typeof body === 'object' ? body : {};
  if (typeof input.ruleText !== 'string') {
    throw httpError(400, 'RULE_TEXT_REQUIRED', 'ruleText is required');
  }
  const ruleText = input.ruleText.replace(/\s+/g, ' ').trim();
  if (ruleText.length < MIN_RULE_CHARS) {
    throw httpError(400, 'RULE_TEXT_REQUIRED', 'ruleText is required');
  }
  if (ruleText.length > MAX_RULE_CHARS) {
    throw httpError(400, 'RULE_TEXT_TOO_LONG', `ruleText must be at most ${MAX_RULE_CHARS} characters`);
  }
  const level = String(input.level ?? fallbackLevel ?? '').trim().toUpperCase();
  if (!RULE_LEVELS.includes(level)) {
    throw httpError(400, 'INVALID_LEVEL', 'Invalid level');
  }
  return { ruleText, level };
}

async function loadPendingFlag(db, flagId) {
  const ref = db.collection('aiReviewFlags').doc(String(flagId));
  const snap = await ref.get();
  if (!snap.exists) throw httpError(404, 'FLAG_NOT_FOUND', 'Feedback not found');
  const data = snap.data() || {};
  if (data.status !== 'pending') {
    throw httpError(409, 'FLAG_ALREADY_DECIDED', 'Feedback was already handled');
  }
  return { ref, snap, data };
}

async function approveFeedback(flagId, adminId, body) {
  const db = getDb();
  const { ref, data } = await loadPendingFlag(db, flagId);
  const { ruleText, level } = validateRuleInput(body, data.level);
  const now = new Date();
  const correction = {
    level,
    ruleText,
    category: data.category,
    sourceFlagId: String(flagId),
    active: true,
    approvedBy: adminId,
    approvedAt: now,
  };
  const correctionRef = await db.collection('aiCorrections').add(correction);
  await ref.update({
    status: 'approved',
    correctionId: correctionRef.id,
    decidedBy: adminId,
    decidedAt: now,
  });
  return { id: correctionRef.id, ...correction, approvedAt: now.toISOString() };
}

async function rejectFeedback(flagId, adminId, body) {
  const db = getDb();
  const { ref } = await loadPendingFlag(db, flagId);
  const reason = validateOptionalText(body?.reason, 'reason');
  await ref.update({
    status: 'rejected',
    rejectReason: reason,
    decidedBy: adminId,
    decidedAt: new Date(),
  });
  return { id: String(flagId), status: 'rejected' };
}

function serializeCorrection(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    level: data.level,
    ruleText: data.ruleText,
    category: data.category || null,
    sourceFlagId: data.sourceFlagId || null,
    active: data.active === true,
    approvedBy: data.approvedBy || null,
    approvedAt: toIso(data.approvedAt),
  };
}

async function listCorrections({ activeOnly = false } = {}) {
  const db = getDb();
  let query = db.collection('aiCorrections');
  if (activeOnly) query = query.where('active', '==', true);
  const snap = await query.get();
  const items = [];
  snap.forEach((doc) => items.push(serializeCorrection(doc)));
  items.sort((a, b) => String(b.approvedAt || '').localeCompare(String(a.approvedAt || '')));
  return items;
}

async function setCorrectionActive(correctionId, active, adminId) {
  if (typeof active !== 'boolean') {
    throw httpError(400, 'INVALID_ACTIVE', 'active must be a boolean');
  }
  const db = getDb();
  const ref = db.collection('aiCorrections').doc(String(correctionId));
  const snap = await ref.get();
  if (!snap.exists) throw httpError(404, 'CORRECTION_NOT_FOUND', 'Rule not found');
  await ref.update({ active, updatedBy: adminId, updatedAt: new Date() });
  return { id: snap.id, active };
}

/** Active rules for one level (plus 'ALL'), newest first — for ai-service. */
async function getActiveCorrectionsForLevel(level) {
  const normalized = normalizeLevel(level);
  if (!normalized) throw httpError(400, 'INVALID_LEVEL', 'Invalid level');
  const all = await listCorrections({ activeOnly: true });
  return all
    .filter((rule) => rule.level === normalized || rule.level === 'ALL')
    .slice(0, MAX_ACTIVE_RULES)
    .map((rule) => ({ id: rule.id, ruleText: rule.ruleText, level: rule.level, approvedAt: rule.approvedAt }));
}

module.exports = {
  FLAG_CATEGORIES,
  REVIEW_STATUSES,
  RULE_LEVELS,
  MAX_COMMENT_CHARS,
  MAX_RULE_CHARS,
  studentAlias,
  sanitizeMessages,
  deriveRuleText,
  listConversations,
  getConversation,
  createFlag,
  completeReview,
  getReviewerStats,
  listFeedback,
  approveFeedback,
  rejectFeedback,
  listCorrections,
  setCorrectionActive,
  getActiveCorrectionsForLevel,
};
