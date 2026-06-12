const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true';
const SKIP_AUTH_ROLE = import.meta.env.VITE_SKIP_AUTH_ROLE || 'student';
const SKIP_AUTH_USER = {
  id: 'dev-user',
  email: import.meta.env.VITE_SKIP_AUTH_EMAIL || 'dev@localhost',
  name: import.meta.env.VITE_SKIP_AUTH_NAME || 'Dev User',
  role: SKIP_AUTH_ROLE,
};

export const getLandingPathForRole = (role) => {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'teacher') return '/teacher/dashboard';
  return '/home';
};

export const login = async ({ email, password }) => {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      password
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'invalidCredentials');
  }

  return {
    token: data.token,
    user: data.user
  };
};

export const storeSession = ({ token, user }) => {
  logout();

  localStorage.setItem('lisan-token', token);
  localStorage.setItem('lisan-user', JSON.stringify(user));
};

export const getStoredToken = () => {
  const token = localStorage.getItem('lisan-token');
  if (token) return token;
  if (SKIP_AUTH) return 'dev-token';
  return null;
};

export const getStoredUser = () => {
  try {
    const stored = localStorage.getItem('lisan-user');
    if (stored) return JSON.parse(stored);
    if (SKIP_AUTH) return SKIP_AUTH_USER;
    return null;
  } catch {
    return SKIP_AUTH ? SKIP_AUTH_USER : null;
  }
};

export const getCurrentUser = async () => {
  if (SKIP_AUTH) {
    return SKIP_AUTH_USER;
  }

  const token = getStoredToken();

  if (!token) {
    throw new Error('No token found');
  }

  const response = await fetch(`${API_BASE_URL}/users/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to load user');
  }

  localStorage.setItem('lisan-user', JSON.stringify(data));

  return data;
};

export const logout = () => {
  localStorage.removeItem('lisan-token');
  localStorage.removeItem('lisan-user');
};
