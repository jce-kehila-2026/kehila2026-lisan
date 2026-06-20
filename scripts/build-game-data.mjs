#!/usr/bin/env node
/**
 * build-game-data.mjs
 * Unified builder for the Lisan word-game.
 *
 * Reads all four levels' seed data and emits ONE game-ready catalog,
 * keyed by level (A1/A2/B1/B2), in the same nested shape the game already
 * understands (category -> { total_words, num_levels, levels: [[word,...]] }).
 *
 * For each level:
 *   1. Load vocabulary-XX.json   (flat single words: the cards)
 *   2. Build sourceTranscript -> category map from lisan-seed-v1-XX.json
 *      (the combined file is the only place that links transcript -> category)
 *      A1's vocabulary already carries an inline `category`, so it's used directly.
 *   3. Tag each vocab word with its category, drop words we can't place.
 *   4. De-duplicate within a level (by hebrew|arabic).
 *   5. Group by category, chunk each into stages of STAGE_SIZE.
 *
 * Output: frontend/src/data/gameWords.json  (keyed by level)
 *
 * Run from repo root:  node scripts/build-game-data.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const STAGE_SIZE = 10;

// Some seed files use inconsistent or compound category labels (e.g. the A2
// combined file has 'jobs_work', 'music_culture', 'past_family_life'). Normalize
// every variant onto the canonical category keys that the game's metadata knows,
// so the build output is always clean regardless of seed sloppiness.
const CATEGORY_ALIASES = {
  jobs_work: 'work_jobs',
  music_culture: 'culture_music',
  travel_places: 'travel',
  social_events: 'past_events',
  past_daily_life: 'past_events',
  past_family_life: 'past_events',
  family_daily_life: 'family',
};

function canonicalCategory(cat) {
  if (!cat) return cat;
  return CATEGORY_ALIASES[cat] || cat;
}

const LEVELS = [
  { level: 'A1', dir: 'content/seed-v1',    vocab: 'vocabulary-a1.json', combined: 'lisan-seed-v1.json' },
  { level: 'A2', dir: 'content/seed-v1-a2', vocab: 'vocabulary-a2.json', combined: 'lisan-seed-v1-a2.json' },
  { level: 'B1', dir: 'content/seed-v1-b1', vocab: 'vocabulary-b1.json', combined: 'lisan-seed-v1-b1.json' },
  { level: 'B2', dir: 'content/seed-v1-b2', vocab: 'vocabulary-b2.json', combined: 'lisan-seed-v1-b2.json' },
];

function loadJSON(rel) {
  return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));
}

// Build sourceTranscript -> category from the combined sentence file.
function transcriptCategoryMap(combinedRel) {
  const map = new Map();
  let rows;
  try {
    rows = loadJSON(combinedRel);
  } catch {
    return map;
  }
  for (const row of rows) {
    const src = row.source_transcript;
    const cat = row.category;
    if (src && cat && !map.has(src)) map.set(src, cat);
  }
  return map;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildLevel({ level, dir, vocab, combined }) {
  const words = loadJSON(`${dir}/${vocab}`);
  const tcMap = transcriptCategoryMap(`${dir}/${combined}`);

  const seen = new Set();
  const byCategory = new Map();
  let uncategorized = 0;
  let dupes = 0;

  for (const w of words) {
    // category: inline (A1) or via transcript map (A2/B1/B2).
    // Words whose transcript isn't in the combined file are grammar-drill
    // forms (verb conjugations, preposition inflections) that have no topic
    // category, so they go into a shared 'grammar' bucket rather than being
    // dropped.
    let category = w.category || tcMap.get(w.source_transcript) || null;
    if (!category) { category = 'grammar'; uncategorized += 1; }
    category = canonicalCategory(category);

    const key = `${w.hebrew}|${w.arabic}`;
    if (seen.has(key)) { dupes += 1; continue; }
    seen.add(key);

    const clean = {
      id: w.id,
      hebrew: w.hebrew,
      arabic: w.arabic,
      transliteration: w.transliteration || '',
      part_of_speech: w.part_of_speech || '',
    };
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(clean);
  }

  const catalog = {};
  for (const [category, list] of byCategory) {
    const levels = chunk(list, STAGE_SIZE);
    catalog[category] = {
      total_words: list.length,
      num_levels: levels.length,
      levels,
    };
  }

  return { catalog, stats: { total: words.length, placed: seen.size, uncategorized, dupes, categories: byCategory.size } };
}

const output = {};
const report = [];
for (const cfg of LEVELS) {
  try {
    const { catalog, stats } = buildLevel(cfg);
    output[cfg.level] = catalog;
    report.push({ level: cfg.level, ...stats });
  } catch (err) {
    report.push({ level: cfg.level, error: String(err.message || err) });
  }
}

const outRel = 'frontend/src/data/gameWords.json';
writeFileSync(resolve(ROOT, outRel), JSON.stringify(output, null, 2) + '\n', 'utf8');

console.log('\n=== Lisan game-data build ===');
for (const r of report) {
  if (r.error) { console.log(`  ${r.level}: ERROR ${r.error}`); continue; }
  console.log(`  ${r.level}: ${r.placed} words placed, ${r.categories} categories` +
    (r.uncategorized ? `, ${r.uncategorized} grammar-drill words \u2192 'grammar'` : '') +
    (r.dupes ? `, ${r.dupes} duplicates removed` : ''));
}
console.log(`\n  wrote ${outRel}\n`);
