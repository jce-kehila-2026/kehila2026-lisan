'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeLevel,
  parseLevel,
  getLevelLabel,
  toStoredLevel,
  isRecognizedLevel,
} = require('../lib/levels');

describe('normalizeLevel', () => {
  const cases = [
    ['A1', 'A1'], ['a2', 'A2'], [' B1 ', 'B1'], ['B2', 'B2'],
    ['א1', 'A1'], ['א2', 'A2'], ['ב1', 'B1'], ['ב2', 'B2'],
    ['ג', 'B2'], ['ג׳', 'B2'], ["א'1", 'A1'],
    ['beginner', 'A1'], ['Beginner', 'A1'],
    ['', 'A1'], [null, 'A1'], [undefined, 'A1'], ['garbage', 'A1'], ['C1', 'A1'],
  ];
  for (const [input, expected] of cases) {
    test(`${JSON.stringify(input)} -> ${expected}`, () => {
      assert.equal(normalizeLevel(input), expected);
    });
  }

  test('unknown never maps to A2', () => {
    assert.notEqual(normalizeLevel('something'), 'A2');
  });
});

describe('parseLevel / isRecognizedLevel', () => {
  test('returns null for unknown', () => {
    assert.equal(parseLevel('xyz'), null);
    assert.equal(parseLevel(''), null);
    assert.equal(isRecognizedLevel('xyz'), false);
    assert.equal(isRecognizedLevel('ג'), true);
  });
});

describe('getLevelLabel', () => {
  test('default labels per CEFR code', () => {
    assert.equal(getLevelLabel('A1'), 'א1');
    assert.equal(getLevelLabel('A2'), 'א2');
    assert.equal(getLevelLabel('B1'), 'ב1');
    assert.equal(getLevelLabel('B2'), 'ב2');
  });

  test('keeps ג when stored as label', () => {
    assert.equal(getLevelLabel('B2', 'ג'), 'ג');
  });

  test('legacy ג stored in level shows ג', () => {
    assert.equal(getLevelLabel('ג'), 'ג');
  });

  test('legacy beginner shows א1', () => {
    assert.equal(getLevelLabel('beginner'), 'א1');
  });
});

describe('userLevelFields', () => {
  const { userLevelFields } = require('../lib/levels');

  test('legacy Hebrew label student', () => {
    assert.deepEqual(userLevelFields({ role: 'student', level: 'ג' }), { level: 'B2', levelLabel: 'ג' });
  });

  test('student without level is A1', () => {
    assert.deepEqual(userLevelFields({ role: 'student' }), { level: 'A1', levelLabel: 'א1' });
  });

  test('teacher without level stays empty', () => {
    assert.deepEqual(userLevelFields({ role: 'teacher', level: '' }), { level: '', levelLabel: '' });
  });
});

describe('toStoredLevel', () => {
  test('Hebrew label input', () => {
    assert.deepEqual(toStoredLevel('א1'), { level: 'A1', levelLabel: 'א1' });
    assert.deepEqual(toStoredLevel('ב2'), { level: 'B2', levelLabel: 'ב2' });
  });

  test('ג is stored as B2 with label ג', () => {
    assert.deepEqual(toStoredLevel('ג'), { level: 'B2', levelLabel: 'ג' });
    assert.deepEqual(toStoredLevel('B2', 'ג'), { level: 'B2', levelLabel: 'ג' });
  });

  test('CEFR input gets default label', () => {
    assert.deepEqual(toStoredLevel('A2'), { level: 'A2', levelLabel: 'א2' });
  });

  test('mismatched label is ignored', () => {
    assert.deepEqual(toStoredLevel('A1', 'ג'), { level: 'A1', levelLabel: 'א1' });
  });

  test('legacy and unknown values', () => {
    assert.deepEqual(toStoredLevel('beginner'), { level: 'A1', levelLabel: 'א1' });
    assert.deepEqual(toStoredLevel(undefined), { level: 'A1', levelLabel: 'א1' });
  });
});
