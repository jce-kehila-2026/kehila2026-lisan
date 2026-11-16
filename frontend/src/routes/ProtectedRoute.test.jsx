// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import ProtectedRoute, { getRedirectPath } from './ProtectedRoute.jsx';
import { getLandingPathForRole } from '../services/auth.js';
import ar from '../i18n/ar.json';
import he from '../i18n/he.json';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Where() {
  const location = useLocation();
  return <span data-testid="where">{location.pathname}</span>;
}

function renderAt(path, role) {
  localStorage.setItem('lisan-token', 'token');
  localStorage.setItem('lisan-user', JSON.stringify({ id: 'u1', role }));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/home" element={<ProtectedRoute role="student"><p>home</p></ProtectedRoute>} />
          <Route path="/chatbot" element={<ProtectedRoute role={['student', 'teacher']}><p>chatbot</p></ProtectedRoute>} />
          <Route path="/admin/dashboard" element={<ProtectedRoute role={['admin', 'teacher']}><p>dashboard</p></ProtectedRoute>} />
          <Route path="/admin/analytics" element={<ProtectedRoute role={['admin', 'teacher']}><p>analytics</p></ProtectedRoute>} />
          <Route path="/admin/ai-feedback" element={<ProtectedRoute role="admin"><p>ai-feedback</p></ProtectedRoute>} />
          <Route path="/teacher/dashboard" element={<ProtectedRoute role="teacher"><p>teacher</p></ProtectedRoute>} />
          <Route path="/review" element={<ProtectedRoute role={['reviewer', 'admin']}><p>review</p></ProtectedRoute>} />
          <Route path="/review/:id" element={<ProtectedRoute role={['reviewer', 'admin']}><p>review-detail</p></ProtectedRoute>} />
          <Route path="/login" element={<p>login</p>} />
        </Routes>
        <Where />
      </MemoryRouter>,
    );
  });
  const where = container.querySelector('[data-testid="where"]').textContent;
  act(() => root.unmount());
  container.remove();
  return where;
}

afterEach(() => {
  localStorage.clear();
});

describe('reviewer routing', () => {
  it('lands reviewers on /review after login', () => {
    expect(getLandingPathForRole('reviewer')).toBe('/review');
    expect(getRedirectPath('reviewer')).toBe('/review');
  });

  it.each(['/review', '/review/abc'])('reviewer can open %s', (path) => {
    expect(renderAt(path, 'reviewer')).toBe(path);
  });

  it.each([
    '/home',
    '/chatbot',
    '/admin/dashboard',
    '/admin/analytics',
    '/admin/ai-feedback',
    '/teacher/dashboard',
  ])('reviewer is redirected from %s to /review', (path) => {
    expect(renderAt(path, 'reviewer')).toBe('/review');
  });

  it('admin may view /review', () => {
    expect(renderAt('/review/abc', 'admin')).toBe('/review/abc');
  });

  it.each([
    ['student', '/home'],
    ['teacher', '/admin/dashboard'],
  ])('%s cannot open /review', (role, expected) => {
    expect(renderAt('/review', role)).toBe(expected);
  });

  it('teacher cannot open the AI feedback queue', () => {
    expect(renderAt('/admin/ai-feedback', 'teacher')).toBe('/admin/dashboard');
  });
});

describe('review i18n keys', () => {
  it('Hebrew and Arabic define the same review / aiFeedback keys', () => {
    const pick = (dict) =>
      Object.keys(dict)
        .filter((key) => key.startsWith('review.') || key.startsWith('admin.aiFeedback.'))
        .sort();
    const heKeys = pick(he);
    expect(heKeys.length).toBeGreaterThan(40);
    expect(pick(ar)).toEqual(heKeys);
    for (const key of heKeys) {
      expect(he[key].trim(), key).not.toBe('');
      expect(ar[key].trim(), key).not.toBe('');
    }
  });

  it('every flag category has a label', () => {
    for (const category of ['hebrew_error', 'wrong_level_too_hard', 'wrong_translation', 'inappropriate', 'off_topic', 'other']) {
      expect(he[`review.category.${category}`]).toEqual(expect.any(String));
      expect(ar[`review.category.${category}`]).toEqual(expect.any(String));
    }
  });
});
