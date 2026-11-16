import { useMemo } from 'react';
import rawGameData from './gameWords.json';
import { getStoredUser } from '../services/auth.js';
import { CEFR_LEVELS, DEFAULT_LEVEL as DEFAULT_CEFR_LEVEL, normalizeLevel as normalizeCefrLevel } from '../utils/levels.js';

// gameWords.json is now keyed by level: { A1: {category: {...}}, A2: {...}, ... }
// Each category is { total_words, num_levels, levels: [[word, ...], ...] }.

export const GAME_LEVELS = CEFR_LEVELS;
// Unknown/unrecognised levels get the beginner game (A1), never A2.
export const DEFAULT_LEVEL = DEFAULT_CEFR_LEVEL;

// Accepts CEFR codes, Hebrew labels (א1..ב2, ג → B2) and legacy 'beginner'.
export function normalizeLevel(value) {
  return normalizeCefrLevel(value);
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

// The catalog depends on the logged-in student's level, so it must be read
// per user at render time — never frozen at module import (before login).
export function useGameCatalog() {
  const level = getActiveLevel();
  return useMemo(() => getCatalogForLevel(level), [level]);
}

export function getTotalLevelCount(catalog = getCatalogForLevel()) {
  return Object.values(catalog).reduce((total, category) => {
    if (!Array.isArray(category?.levels)) return total;
    return total + category.levels.length;
  }, 0);
}

export function getUniqueGameWordCount(catalog = getCatalogForLevel()) {
  return getUniqueGameWords(catalog).length;
}

export function getCompletedWordEntries(progressCategories = {}, catalog = getCatalogForLevel()) {
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

export function getCompletedWordCount(progressCategories = {}, catalog = getCatalogForLevel()) {
  return getCompletedWordEntries(progressCategories, catalog).length;
}
