'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildNameRedactor } = require('../services/nameRedaction');

const COMMON = 'שלום! מה שלומך היום? אני רוצה ללמוד מילים חדשות. בטח! המילה הראשונה היא בית. '
  + 'איזה אוכל אתן אוהבות לבשל יחד? אתמול בערב קראתי ספר מעניין. ומה את עשית? לנו יש הרבה זמן. מצוין, עוד משהו?';

test('masks exact Hebrew spelling, with a one-letter prefix', () => {
  const redact = buildNameRedactor(['יסמין חדאד']);
  assert.equal(redact('שלום יסמין! ליסמין יש חתול, חדאד.'), 'שלום [שם]! ל[שם] יש חתול, [שם].');
});

test('masks the Hebrew transliteration of a Latin-script name', () => {
  const redact = buildNameRedactor(['Rania Khoury']);
  assert.equal(redact("יופי, רניה! ראניה ח'ורי. Hi Rania"), 'יופי, [שם]! [שם] [שם]. Hi [שם]');
});

test('masks the Hebrew transliteration of an Arabic-script name', () => {
  assert.equal(buildNameRedactor(['ياسمين'])('שלום יאסמין ויסמין'), 'שלום [שם] ו[שם]');
  assert.equal(buildNameRedactor(['فاطمة'])('פאטמה, מה נשמע?'), '[שם], מה נשמע?');
  assert.equal(buildNameRedactor(['محمد'])('מוחמד ומחמד'), '[שם] ו[שם]');
});

test('leaves ordinary tutor sentences alone', () => {
  for (const name of ['Rania Khoury', 'ياسمين حداد', 'فاطمة', 'محمد', 'Lina', 'Sarah', 'Dana', 'Mona', 'Amal', 'أمل', 'Huda', 'Maya']) {
    assert.equal(buildNameRedactor([name])(COMMON), COMMON, name);
  }
  assert.equal(buildNameRedactor(['Lina'])('לינה, לנו יש זמן'), '[שם], לנו יש זמן');
});

test('no names -> identity; non-strings pass through', () => {
  assert.equal(buildNameRedactor([null, '', undefined])('שלום'), 'שלום');
  assert.equal(buildNameRedactor(['Rania'])(null), null);
});
