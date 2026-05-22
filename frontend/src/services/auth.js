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

const getRoleFromUsername = (email = '') => {
  const normalized = email.trim().toLowerCase();

  if (normalized === 'student' || normalized === 'teacher' || normalized === 'admin') {
    return normalized;
  }

  return null;
};

export const getLandingPathForRole = (role) => {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'teacher') return '/teacher/dashboard';
  return '/home';
};

export const login = async ({ email, password }) => {
  if (password !== '123456') {
    throw new Error('invalidCredentials');
  }

  const role = getRoleFromUsername(email);

  if (!role) {
    throw new Error('unknownUser');
  }

  const session = mockUsers[role];

  return {
    ...session,
    user: {
      ...session.user,
      name: session.user.name,
    },
  };
};

export const storeSession = ({ token, user }) => {
  logout();
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
