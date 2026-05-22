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

  if (normalized.includes('teacher')) {
    return 'teacher';
  }

  return 'student';
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

  const inferredRole = inferRoleFromAccount(email);
  const session = mockUsers[inferredRole];

  return {
    ...session,
    user: {
      ...session.user,
      name: email || session.user.name,
    },
  };
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
