import rawGameData from './gameWords.json';
import { getStoredUser } from '../services/auth.js';

// gameWords.json is now keyed by level: { A1: {category: {...}}, A2: {...}, ... }
// Each category is { total_words, num_levels, levels: [[word, ...], ...] }.

export const GAME_LEVELS = ['A1', 'A2', 'B1', 'B2'];
export const DEFAULT_LEVEL = 'A2';

const LEVEL_ALIASES = { beginner: 'A1', a1: 'A1', a2: 'A2', b1: 'B1', b2: 'B2' };

export function normalizeLevel(value) {
  if (!value) return DEFAULT_LEVEL;
  const key = String(value).trim().toLowerCase();
  const mapped = LEVEL_ALIASES[key] || String(value).trim().toUpperCase();
  return GAME_LEVELS.includes(mapped) ? mapped : DEFAULT_LEVEL;
}

export function getActiveLevel() {
  const user = getStoredUser();
  return normalizeLevel(user?.level);
}

export function getCatalogForLevel(level = getActiveLevel()) {
  const key = normalizeLevel(level);
  return rawGameData[key] || {};
}

export function getWordKey(word) {
  return word?.id || `${word?.hebrew || ''}|${word?.arabic || ''}`;
}

export function getUniqueGameWords(catalog = getCatalogForLevel()) {
  const byKey = new Map();
  for (const [categoryKey, category] of Object.entries(catalog)) {
    if (!Array.isArray(category?.levels)) continue;
    category.levels.forEach((level, levelIndex) => {
      if (!Array.isArray(level)) return;
      level.forEach((word, cardIndex) => {
        const key = getWordKey(word);
        if (byKey.has(key)) return;
        byKey.set(key, { ...word, categoryKey, levelIndex, cardIndex });
      });
    });
  }
  return Array.from(byKey.values());
}

export const gameCatalog = getCatalogForLevel();

export function getTotalLevelCount(catalog = gameCatalog) {
  return Object.values(catalog).reduce((total, category) => {
    if (!Array.isArray(category?.levels)) return total;
    return total + category.levels.length;
  }, 0);
}

export function getUniqueGameWordCount(catalog = gameCatalog) {
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
        byKey.set(key, { ...word, categoryKey, levelIndex, cardIndex, levelLabel: category.levelLabels?.[levelIndex] || null });
      });
    }
  }
  return Array.from(byKey.values());
}

export function getCompletedWordCount(progressCategories = {}, catalog = gameCatalog) {
  return getCompletedWordEntries(progressCategories, catalog).length;
}
