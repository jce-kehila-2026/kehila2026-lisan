'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { planLevelMigration } = require('../../scripts/migrate-user-levels');

describe('planLevelMigration', () => {
  test('maps legacy values to CEFR + label and skips normalized/non-students', () => {
    const changes = planLevelMigration([
      { id: 'u1', email: 'a@x', role: 'student', level: 'א1' },
      { id: 'u2', email: 'b@x', role: 'student', level: 'ג' },
      { id: 'u3', email: 'c@x', role: 'student', level: 'beginner' },
      { id: 'u4', email: 'd@x', role: 'student', level: 'B1', levelLabel: 'ב1' },
      { id: 'u5', email: 'e@x', role: 'teacher', level: '' },
      { id: 'u6', email: 'f@x', role: 'student', level: 'A2' },
      { id: 'u7', email: 'g@x', role: 'student' },
      { id: 'u8', email: 'h@x', role: 'student', level: 'B2', levelLabel: 'ג' },
    ]);

    const byUid = Object.fromEntries(changes.map((c) => [c.uid, c]));

    assert.deepEqual(Object.keys(byUid).sort(), ['u1', 'u2', 'u3', 'u6', 'u7']);
    assert.equal(byUid.u1.newLevel, 'A1');
    assert.equal(byUid.u1.newLabel, 'א1');
    assert.equal(byUid.u2.newLevel, 'B2');
    assert.equal(byUid.u2.newLabel, 'ג');
    assert.equal(byUid.u3.newLevel, 'A1');
    assert.equal(byUid.u6.newLevel, 'A2');
    assert.equal(byUid.u6.newLabel, 'א2');
    assert.equal(byUid.u7.newLevel, 'A1');
    assert.equal(byUid.u7.oldLevel, '(none)');
  });
});
