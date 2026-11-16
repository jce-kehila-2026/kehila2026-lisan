/**
 * Teacher-management code check.
 *
 * The code is provided at build time via VITE_TEACHER_MGMT_CODE (see
 * frontend/.env.example). It is never hard-coded in this public repo.
 * Fail closed: when the variable is unset or empty, every code is rejected.
 *
 * Note: this is a convenience gate in the browser, not real security — the
 * value ends up in the built JS bundle. Server-side role checks still apply.
 */
export const isValidTeacherManagementCode = (
  input,
  expected = import.meta.env.VITE_TEACHER_MGMT_CODE,
) => {
  const expectedCode = String(expected ?? '').trim();
  if (!expectedCode) return false;
  return String(input ?? '').trim() === expectedCode;
};
