'use strict';

/**
 * Single source of truth for student levels in the backend.
 *
 * Canonical stored/content level: CEFR code A1 | A2 | B1 | B2.
 * Display labels shown to admins: א1, א2, ב1, ב2, ג.
 * Label "ג" has no content of its own — its content level is B2. We store
 * { level: 'B2', levelLabel: 'ג' } so admins can still tell ב2 from ג.
 *
 * Legacy Firestore values ('א1', 'ג', 'beginner', lowercase codes) are
 * normalized on read, so they work even before the migration script runs.
 * Unknown values fall back to A1 (most lenient) — never A2.
 */

const CEFR_LEVELS = Object.freeze(['A1', 'A2', 'B1', 'B2']);
const DEFAULT_LEVEL = 'A1';

const DEFAULT_LABEL_BY_LEVEL = Object.freeze({
  A1: 'א1',
  A2: 'א2',
  B1: 'ב1',
  B2: 'ב2',
});

// Display options in admin order. 'ג' shares B2 content.
const LEVEL_LABEL_OPTIONS = Object.freeze(['א1', 'א2', 'ב1', 'ב2', 'ג']);

const ALIASES = Object.freeze({
  A1: 'A1',
  A2: 'A2',
  B1: 'B1',
  B2: 'B2',
  'א1': 'A1',
  'א2': 'A2',
  'ב1': 'B1',
  'ב2': 'B2',
  'ג': 'B2',
  'א': 'A1',
  'ב': 'B1',
  BEGINNER: 'A1',
  ELEMENTARY: 'A2',
  INTERMEDIATE: 'B1',
  ADVANCED: 'B2',
});

function cleanLevelInput(value) {
  return String(value ?? '')
    .trim()
    .replace(/['"׳״\s\-_.]/g, '')
    .toUpperCase();
}

/** Returns the CEFR code for a recognised value, or null when unrecognised. */
function parseLevel(value) {
  const cleaned = cleanLevelInput(value);
  if (!cleaned) return null;
  return ALIASES[cleaned] || null;
}

/** Always returns a CEFR code; unknown/empty → A1. */
function normalizeLevel(value) {
  return parseLevel(value) || DEFAULT_LEVEL;
}

function isRecognizedLevel(value) {
  return parseLevel(value) !== null;
}

/**
 * Display label for a stored record.
 * Prefers an explicit stored label (e.g. 'ג'), then a label-shaped raw level
 * (legacy 'ג' stored in `level`), then the default label for the CEFR code.
 */
function getLevelLabel(level, levelLabel) {
  const cleanedLabel = cleanLevelInput(levelLabel);
  if (cleanedLabel && LEVEL_LABEL_OPTIONS.includes(cleanedLabel)) {
    return cleanedLabel;
  }
  const cleanedLevel = cleanLevelInput(level);
  if (LEVEL_LABEL_OPTIONS.includes(cleanedLevel)) {
    return cleanedLevel;
  }
  return DEFAULT_LABEL_BY_LEVEL[normalizeLevel(level)];
}

/**
 * Converts any admin input (CEFR code or Hebrew label) to the stored shape.
 * `levelLabel` (optional) wins for the label when it maps to the same level.
 */
function toStoredLevel(value, levelLabel) {
  const labelLevel = parseLevel(levelLabel);
  const level = parseLevel(value) || labelLevel || DEFAULT_LEVEL;
  const label =
    labelLevel === level ? getLevelLabel(level, levelLabel) : getLevelLabel(value);
  return {
    level,
    levelLabel: parseLevel(label) === level ? label : DEFAULT_LABEL_BY_LEVEL[level],
  };
}

/**
 * Level fields for API responses built from a Firestore user record.
 * Students always get a CEFR level + label; other roles keep empty values
 * unless a level is stored.
 */
function userLevelFields(user = {}) {
  const raw = user?.level;
  const hasLevel = String(raw ?? '').trim() !== '';
  if (!hasLevel && user?.role !== 'student') {
    return { level: '', levelLabel: '' };
  }
  return {
    level: normalizeLevel(raw),
    levelLabel: getLevelLabel(raw, user?.levelLabel),
  };
}

module.exports = {
  userLevelFields,
  CEFR_LEVELS,
  DEFAULT_LEVEL,
  DEFAULT_LABEL_BY_LEVEL,
  LEVEL_LABEL_OPTIONS,
  parseLevel,
  normalizeLevel,
  isRecognizedLevel,
  getLevelLabel,
  toStoredLevel,
};
