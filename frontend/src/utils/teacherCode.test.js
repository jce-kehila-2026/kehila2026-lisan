import { describe, expect, it } from 'vitest';

import { isValidTeacherManagementCode } from './teacherCode.js';

describe('isValidTeacherManagementCode', () => {
  it('rejects every code when the env value is unset or empty (fail closed)', () => {
    expect(isValidTeacherManagementCode('0000', undefined)).toBe(false);
    expect(isValidTeacherManagementCode('', '')).toBe(false);
    expect(isValidTeacherManagementCode('   ', '  ')).toBe(false);
  });

  it('accepts only the configured code', () => {
    expect(isValidTeacherManagementCode('7391', '7391')).toBe(true);
    expect(isValidTeacherManagementCode(' 7391 ', '7391')).toBe(true);
    expect(isValidTeacherManagementCode('0000', '7391')).toBe(false);
  });

  it('no longer accepts the old hard-coded 0000 by default', () => {
    expect(isValidTeacherManagementCode('0000')).toBe(false);
  });
});
