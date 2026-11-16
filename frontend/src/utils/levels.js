/**
 * Single source of truth for student levels in the frontend.
 *
 * Canonical (content) level: CEFR code A1 | A2 | B1 | B2 — what the backend
 * stores and what decides which content a student gets.
 * Display labels for admins: א1, א2, ב1, ב2, ג. Label ג has no content of
 * its own; its content level is B2 (stored as level B2 + levelLabel ג).
 *
 * Unknown/empty values fall back to A1 (most lenient) — never A2.
 */

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2'];
export const DEFAULT_LEVEL = 'A1';
export const LEVEL_LABEL_OPTIONS = ['א1', 'א2', 'ב1', 'ב2', 'ג'];

export const DEFAULT_LABEL_BY_LEVEL = {
  A1: 'א1',
  A2: 'א2',
  B1: 'ב1',
  B2: 'ב2',
};

const ALIASES = {
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
};

const clean = (value) =>
  String(value ?? '')
    .trim()
    .replace(/['"׳״\s\-_.]/g, '')
    .toUpperCase();

/** CEFR code for a recognised value, or null. */
export const parseLevel = (value) => {
  const cleaned = clean(value);
  return cleaned ? ALIASES[cleaned] || null : null;
};

/** Always a CEFR code; unknown/empty → A1. */
export const normalizeLevel = (value) => parseLevel(value) || DEFAULT_LEVEL;

/** Display label for a stored level (+ optional stored label). */
export const getLevelLabel = (level, levelLabel) => {
  const cleanedLabel = clean(levelLabel);
  if (LEVEL_LABEL_OPTIONS.includes(cleanedLabel)) return cleanedLabel;
  const cleanedLevel = clean(level);
  if (LEVEL_LABEL_OPTIONS.includes(cleanedLevel)) return cleanedLevel;
  return DEFAULT_LABEL_BY_LEVEL[normalizeLevel(level)];
};

/** Admin-picked label → payload the backend stores. */
export const labelToStoredLevel = (label) => {
  const level = normalizeLevel(label);
  const levelLabel = getLevelLabel(label);
  return { level, levelLabel };
};
