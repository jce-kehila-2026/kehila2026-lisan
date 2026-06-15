import rawGameData from './gameWords.json';

export const ALPHABET_CATEGORY_KEY = 'hebrew_letters';

export const HEBREW_ALPHABET = [
  'א',
  'ב',
  'ג',
  'ד',
  'ה',
  'ו',
  'ז',
  'ח',
  'ט',
  'י',
  'כ',
  'ל',
  'מ',
  'נ',
  'ס',
  'ע',
  'פ',
  'צ',
  'ק',
  'ר',
  'ש',
  'ת',
];

const FINAL_LETTER_MAP = {
  ך: 'כ',
  ם: 'מ',
  ן: 'נ',
  ף: 'פ',
  ץ: 'צ',
};

const ALPHABET_LEVEL_SIZE = 10;

export function getWordKey(word) {
  return word?.id || `${word?.hebrew || ''}|${word?.arabic || ''}`;
}

function getHebrewInitial(value = '') {
  const match = String(value).trim().match(/[\u05d0-\u05ea]/u);
  if (!match) return '';
  return FINAL_LETTER_MAP[match[0]] || match[0];
}

export function getUniqueGameWords(catalog = rawGameData) {
  const byKey = new Map();

  for (const [categoryKey, category] of Object.entries(catalog)) {
    if (!Array.isArray(category?.levels)) continue;

    category.levels.forEach((level, levelIndex) => {
      if (!Array.isArray(level)) return;

      level.forEach((word, cardIndex) => {
        const key = getWordKey(word);
        if (byKey.has(key)) return;

        byKey.set(key, {
          ...word,
          categoryKey,
          levelIndex,
          cardIndex,
        });
      });
    });
  }

  return Array.from(byKey.values());
}

function buildAlphabetCategory() {
  const groups = new Map(HEBREW_ALPHABET.map((letter) => [letter, []]));

  for (const word of getUniqueGameWords(rawGameData)) {
    const letter = getHebrewInitial(word.hebrew);
    if (!groups.has(letter)) continue;
    groups.get(letter).push(word);
  }

  const levels = [];
  const levelLabels = [];

  for (const letter of HEBREW_ALPHABET) {
    const words = (groups.get(letter) || []).sort((a, b) =>
      String(a.hebrew).localeCompare(String(b.hebrew), 'he'),
    );

    for (let index = 0; index < words.length; index += ALPHABET_LEVEL_SIZE) {
      const chunk = words
        .slice(index, index + ALPHABET_LEVEL_SIZE)
        .map(({ categoryKey, levelIndex, cardIndex, ...word }) => word);
      const chunkNumber = Math.floor(index / ALPHABET_LEVEL_SIZE) + 1;

      levels.push(chunk);
      levelLabels.push({
        letter,
        he: chunkNumber === 1 ? `אות ${letter}` : `אות ${letter} ${chunkNumber}`,
        ar: chunkNumber === 1 ? `حرف ${letter}` : `حرف ${letter} ${chunkNumber}`,
      });
    }
  }

  return {
    total_words: levels.reduce((total, level) => total + level.length, 0),
    num_levels: levels.length,
    levels,
    levelLabels,
    derivedFrom: 'gameWords',
  };
}

export const gameCatalog = {
  [ALPHABET_CATEGORY_KEY]: buildAlphabetCategory(),
  ...rawGameData,
};

export function getTotalLevelCount(catalog = gameCatalog) {
  return Object.values(catalog).reduce((total, category) => {
    if (!Array.isArray(category?.levels)) return total;
    return total + category.levels.length;
  }, 0);
}

export function getUniqueGameWordCount(catalog = rawGameData) {
  return getUniqueGameWords(catalog).length;
}

export function getCompletedWordEntries(progressCategories = {}, catalog = gameCatalog) {
  const byKey = new Map();

  for (const [categoryKey, completedLevels] of Object.entries(progressCategories || {})) {
    if (!Array.isArray(completedLevels)) continue;

    const category = catalog[categoryKey];
    if (!category || !Array.isArray(category.levels)) continue;

    for (const levelIndex of completedLevels) {
      const level = category.levels[levelIndex];
      if (!Array.isArray(level)) continue;

      level.forEach((word, cardIndex) => {
        const key = getWordKey(word);
        if (byKey.has(key)) return;

        byKey.set(key, {
          ...word,
          categoryKey,
          levelIndex,
          cardIndex,
          levelLabel: category.levelLabels?.[levelIndex] || null,
        });
      });
    }
  }

  return Array.from(byKey.values());
}

export function getCompletedWordCount(progressCategories = {}, catalog = gameCatalog) {
  return getCompletedWordEntries(progressCategories, catalog).length;
}
