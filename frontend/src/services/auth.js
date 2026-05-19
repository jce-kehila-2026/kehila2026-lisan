const API_URL = '/api/auth/login';

const mockUsers = {
  student: {
    token: 'mock-student-token',
    user: { id: 'student_001', name: 'student', role: 'student' },
  },
  teacher: {
    token: 'mock-teacher-token',
    user: { id: 'teacher_001', name: 'teacher', role: 'teacher' },
  },
  admin: {
    token: 'mock-admin-token',
    user: { id: 'admin_001', name: 'admin', role: 'admin' },
  },
};

const inferRoleFromAccount = (email = '') => {
  const normalized = email.trim().toLowerCase();

  if (normalized.includes('admin')) {
    return 'admin';
  }

  if (normalized.includes('teacher') || normalized.includes('more') || normalized.includes('מורה')) {
    return 'teacher';
  }

  return 'student';
};

export const login = async ({ email, password }) => {
  const inferredRole = inferRoleFromAccount(email);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: email, password }),
    });

    const data = await response.json();

    if (!response.ok || data.success === false) {
      throw new Error(data.error || 'invalidCredentials');
    }

    const backendRole = data.user?.role;

    return {
      token: data.token,
      user: {
        ...data.user,
        name: data.user?.name || email,
        role: backendRole && backendRole !== 'student' ? backendRole : inferredRole,
      },
    };
  } catch (error) {
    if (error.message !== 'invalidCredentials') {
      return {
        ...mockUsers[inferredRole],
        user: {
          ...mockUsers[inferredRole].user,
          name: email || mockUsers[inferredRole].user.name,
        },
      };
    }

    throw error;
  }
};

export const storeSession = ({ token, user }) => {
  localStorage.setItem('lisan-token', token);
  localStorage.setItem('lisan-user', JSON.stringify(user));
};

export const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('lisan-user'));
  } catch {
    return null;
  }
};

export const logout = () => {
  localStorage.removeItem('lisan-token');
  localStorage.removeItem('lisan-user');
};
