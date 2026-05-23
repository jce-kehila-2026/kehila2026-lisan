const API_BASE_URL = 'http://localhost:3000/api';

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
  return localStorage.getItem('lisan-token');
};

export const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('lisan-user'));
  } catch {
    return null;
  }
};

export const getCurrentUser = async () => {
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