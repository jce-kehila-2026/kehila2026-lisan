// API client for the volunteer reviewer area (/review). Reviewers only ever
// see anonymised conversations: the backend never returns student PII.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export const FLAG_CATEGORIES = [
  'hebrew_error',
  'wrong_level_too_hard',
  'wrong_translation',
  'inappropriate',
  'off_topic',
  'other',
];

export const REVIEW_LEVELS = ['A1', 'A2', 'B1', 'B2'];
export const MAX_FEEDBACK_CHARS = 1000;

const request = async (path, options = {}) => {
  const token = localStorage.getItem('lisan-token');
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed');
    error.status = response.status;
    error.code = data.code;
    throw error;
  }

  return data;
};

export const listReviewConversations = async ({ level, status, cursor } = {}) => {
  const params = new URLSearchParams();
  if (level) params.set('level', level);
  if (status) params.set('status', status);
  if (cursor) params.set('cursor', cursor);
  const query = params.toString();
  return request(`/review/conversations${query ? `?${query}` : ''}`);
};

export const getReviewConversation = async (id) =>
  request(`/review/conversations/${encodeURIComponent(id)}`);

export const flagReviewMessage = async (id, { messageIndex, category, comment, suggestedCorrection }) =>
  request(`/review/conversations/${encodeURIComponent(id)}/flags`, {
    method: 'POST',
    body: JSON.stringify({ messageIndex, category, comment, suggestedCorrection }),
  });

export const completeReview = async (id) =>
  request(`/review/conversations/${encodeURIComponent(id)}/complete`, { method: 'POST' });

export const getMyReviewStats = async () => request('/review/stats');
