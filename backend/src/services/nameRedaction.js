'use strict';

/**
 * nameRedaction.js — mask a learner's name inside chat text shown to
 * volunteer reviewers.
 *
 * The tutor is told the learner's name and greets her with it, and learners
 * type it themselves ("קוראים לי ..."). The profile name may be stored in
 * Arabic, Hebrew or Latin script while the tutor writes it in Hebrew, so
 * besides the exact spelling we also match a loose Hebrew transliteration of
 * every Arabic/Latin name part (consonant skeleton with optional vowel
 * letters). This is a best-effort privacy filter: it errs on masking a word
 * too many rather than leaking a name.
 */

const NAME_PLACEHOLDER = '[שם]';
// Optional one-letter Hebrew/Arabic prefixes glued to a name ("ליסמין", "وأحمد").
const NAME_PREFIX = '(?:[והבכלמש]|[وفبلك])?';
const G = "['׳]?"; // optional geresh (ג׳ / ג')

const LATIN_DIGRAPHS = {
  sh: 'ש',
  ch: `(?:ח${G}|כ|ך|צ${G}|ש)`,
  kh: `(?:ח${G}|כ|ך)`,
  th: `(?:ת${G}|ט|ס|ד)`,
  gh: `(?:ג|ר|ע${G})`,
  ph: '(?:פ|ף)',
  dh: `(?:ד${G}|ז|ת)`,
};

const LATIN_CONSONANTS = {
  b: 'ב',
  c: '(?:ק|כ|ך|ס)',
  d: '(?:ד|ת)',
  f: '(?:פ|ף)',
  g: `(?:ג${G})`,
  h: '(?:ה|ח)',
  j: `(?:ג${G}|ז${G}|י)`,
  k: '(?:ק|כ|ך)',
  l: 'ל',
  m: '(?:מ|ם)',
  n: '(?:נ|ן)',
  p: '(?:פ|ף)',
  q: '(?:ק|כ)',
  r: 'ר',
  s: '(?:ס|ש|צ|ץ|ז)',
  t: '(?:ט|ת)',
  v: '(?:וו|ו|ב)',
  w: '(?:וו|ו)',
  x: '(?:קס|כס)',
  z: '(?:ז|צ|ץ)',
};

const ARABIC_LETTERS = {
  'ب': 'ב',
  'ت': '(?:ת|ט)',
  'ث': `(?:ת${G}|ס)`,
  'ج': `(?:ג${G}|ז${G})`,
  'ح': '(?:ח|ה)',
  'خ': `(?:ח${G}|כ|ך)`,
  'د': 'ד',
  'ذ': `(?:ד${G}|ז)`,
  'ر': 'ר',
  'ز': 'ז',
  'س': '(?:ס|ש)',
  'ش': 'ש',
  'ص': '(?:צ|ץ|ס)',
  'ض': `(?:ד${G}|צ${G}|ץ)`,
  'ط': '(?:ט|ת)',
  'ظ': `(?:ז${G}|ט${G})`,
  'غ': `(?:ע${G}|ג|ר)`,
  'ف': '(?:פ|ף)',
  'ق': '(?:ק|כ)',
  'ك': '(?:כ|ך|ק)',
  'ل': 'ל',
  'م': '(?:מ|ם)',
  'ن': '(?:נ|ן)',
  'ه': '(?:ה|ח)',
};
const ARABIC_ALEFS = new Set(['ا', 'أ', 'إ', 'آ', 'ء', 'ئ', 'ؤ']);
const FINAL_A = '(?:ה|א)';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Hebrew-transliteration pattern for a Latin name part, or null. */
function latinToHebrewPattern(token) {
  const word = token.toLowerCase().replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
  if (word.length < 2) return null;
  const parts = [];
  let consonants = 0;
  for (let i = 0; i < word.length; i += 1) {
    const ch = word[i];
    const pair = word.slice(i, i + 2);
    const isLast = i === word.length - 1;
    if (LATIN_DIGRAPHS[pair]) {
      parts.push(LATIN_DIGRAPHS[pair]);
      consonants += 1;
      i += 1;
      continue;
    }
    if ((pair === 'ah' || pair === 'eh') && i + 2 === word.length) {
      parts.push(FINAL_A);
      break;
    }
    if (ch === 'y') {
      const next = word[i + 1];
      if (i === 0 || (next && 'aeiou'.includes(next))) {
        parts.push('י');
        consonants += 1;
      } else {
        parts.push('י?');
      }
      continue;
    }
    if (ch === 'a') {
      parts.push(isLast ? FINAL_A : (i === 0 ? 'א' : 'א?'));
      continue;
    }
    if (ch === 'e') {
      parts.push(isLast ? '(?:ה|י|א)?' : (i === 0 ? 'א?' : 'י?'));
      continue;
    }
    if (ch === 'i') {
      parts.push(i === 0 ? 'אי?' : 'י?');
      continue;
    }
    if (ch === 'o' || ch === 'u') {
      parts.push(i === 0 ? 'או?' : 'ו?');
      continue;
    }
    if (LATIN_CONSONANTS[ch]) {
      parts.push(LATIN_CONSONANTS[ch]);
      consonants += 1;
    }
  }
  return consonants >= 2 ? parts.join('') : null;
}

/** Hebrew-transliteration pattern for an Arabic name part, or null. */
function arabicToHebrewPattern(token) {
  // Drop harakat/tatweel; keep letters only.
  const word = token.replace(/[ً-ٰٟـ]/g, '').replace(/[^ء-ي]/g, '');
  if (word.length < 2) return null;
  const parts = [];
  let consonants = 0;
  const GAP = '[אוי]?'; // short vowels are unwritten in Arabic
  for (let i = 0; i < word.length; i += 1) {
    const ch = word[i];
    const isLast = i === word.length - 1;
    let piece;
    if (ARABIC_ALEFS.has(ch)) {
      piece = isLast ? FINAL_A : (i === 0 ? 'א' : 'א?');
    } else if (ch === 'ة' || ch === 'ى') {
      piece = '(?:ה|א|ת|י)';
    } else if (ch === 'ع') {
      piece = `(?:ע${G}|א)?`;
    } else if (ch === 'و') {
      piece = 'ו';
    } else if (ch === 'ي') {
      piece = 'י';
    } else if (ARABIC_LETTERS[ch]) {
      piece = ARABIC_LETTERS[ch];
      consonants += 1;
    } else {
      continue;
    }
    if (parts.length > 0) parts.push(GAP);
    parts.push(piece);
  }
  return consonants >= 2 ? parts.join('') : null;
}

function nameParts(names) {
  const tokens = new Set();
  for (const raw of names) {
    if (typeof raw !== 'string') continue;
    const full = raw.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (full.length >= 2) tokens.add(full);
    for (const part of full.split(/[\s\-_.,]+/)) {
      if (part.length >= 2) tokens.add(part);
    }
  }
  return [...tokens];
}

/** Returns text => text with every known form of the names masked. */
function buildNameRedactor(names) {
  const tokens = nameParts(names);
  if (tokens.length === 0) return (text) => text;

  const alternatives = new Set();
  for (const token of tokens.sort((a, b) => b.length - a.length)) {
    alternatives.add(escapeRegExp(token));
  }
  for (const token of tokens) {
    if (token.includes(' ')) continue;
    const latin = /[A-Za-z]/.test(token) ? latinToHebrewPattern(token) : null;
    const arabic = /[ء-ي]/.test(token) ? arabicToHebrewPattern(token) : null;
    if (latin) alternatives.add(latin);
    if (arabic) alternatives.add(arabic);
  }

  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(${NAME_PREFIX})(?:${[...alternatives].join('|')})(?![\\p{L}\\p{N}])`,
    'giu'
  );
  return (text) => (typeof text === 'string' ? text.replace(pattern, `$1${NAME_PLACEHOLDER}`) : text);
}

module.exports = {
  NAME_PLACEHOLDER,
  buildNameRedactor,
  latinToHebrewPattern,
  arabicToHebrewPattern,
};
