import { describe, expect, it } from 'vitest';

import { getLevelLabel, labelToStoredLevel, normalizeLevel } from './levels.js';

describe('normalizeLevel', () => {
  it.each([
    ['A1', 'A1'],
    ['a2', 'A2'],
    ['B1', 'B1'],
    ['B2', 'B2'],
    ['א1', 'A1'],
    ['א2', 'A2'],
    ['ב1', 'B1'],
    ['ב2', 'B2'],
    ['ג', 'B2'],
    ['beginner', 'A1'],
    ['', 'A1'],
    [undefined, 'A1'],
    ['nonsense', 'A1'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeLevel(input)).toBe(expected);
  });
});

describe('getLevelLabel', () => {
  it('maps CEFR to default labels and keeps ג', () => {
    expect(getLevelLabel('A1')).toBe('א1');
    expect(getLevelLabel('B2')).toBe('ב2');
    expect(getLevelLabel('B2', 'ג')).toBe('ג');
    expect(getLevelLabel('ג')).toBe('ג');
    expect(getLevelLabel('beginner')).toBe('א1');
  });
});

describe('labelToStoredLevel', () => {
  it('stores ג as B2 with label ג', () => {
    expect(labelToStoredLevel('ג')).toEqual({ level: 'B2', levelLabel: 'ג' });
    expect(labelToStoredLevel('א1')).toEqual({ level: 'A1', levelLabel: 'א1' });
  });
});
