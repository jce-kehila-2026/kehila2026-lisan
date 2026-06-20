const API_BASE_URL = '/api';

const getToken = () => localStorage.getItem('lisan-token');

const request = async (path, options = {}) => {
  const token = getToken();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
};

const normalizeTeacherIds = (user) => {
  if (Array.isArray(user.teacherIds)) {
    return user.teacherIds;
  }

  if (user.teacherId) {
    return [user.teacherId];
  }

  return [];
};

const mapUserToStudent = (user) => ({
  id: user.id,
  name: user.name || '',
  email: user.email || '',
  level: user.level || 'A1',
  language: user.language || 'ar',
  role: user.role || 'student',
  status: user.isActive === false ? 'suspended' : 'active',
  teacherIds: normalizeTeacherIds(user),
  lastLoginAt: user.lastLoginAt || null,
  createdAt: user.createdAt || null
});

const mapUserToTeacher = (user) => ({
  id: user.id,
  name: user.name || '',
  email: user.email || '',
  role: user.role || 'teacher',
  level: user.level || '',
  levels: Array.isArray(user.levels) ? user.levels : [],
  levelFocus: user.levelFocus || '',
  language: user.language || 'ar',
  status: user.isActive === false ? 'suspended' : 'active',
  createdAt: user.createdAt || null,
  lastLoginAt: user.lastLoginAt || null
});

export const getStudents = async () => {
  const data = await request('/admin/users');

  const students = data.users
    .filter((user) => user.role === 'student')
    .map(mapUserToStudent);

  return { students };
};

export const getStudent = async (id) => {
  const data = await request('/admin/users');

  const student = data.users
    .filter((user) => user.role === 'student')
    .map(mapUserToStudent)
    .find((item) => item.id === id);

  if (!student) {
    throw new Error('התלמידה לא נמצאה');
  }

  return { student };
};

export const createStudent = async (student) => {
  const data = await request('/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: student.email,
      password: student.password || 'Test1234!',
      name: student.name,
      role: 'student',
      level: student.level || 'A1',
      language: student.language || 'ar',
      teacherIds: Array.isArray(student.teacherIds) ? student.teacherIds : []
    })
  });

  return {
    student: mapUserToStudent(data.user)
  };
};

export const updateStudent = async (id, student) => {
  const body = {
    name: student.name,
    email: student.email,
    level: student.level,
    language: student.language,
    teacherIds: Array.isArray(student.teacherIds) ? student.teacherIds : [],
    isActive: student.status ? student.status !== 'suspended' : undefined
  };

  if (student.password && student.password.trim() !== '') {
    body.password = student.password;
  }

  const data = await request(`/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });

  return {
    success: data.success,
    student: {
      id,
      ...student,
      password: ''
    }
  };
};

export const deleteStudent = async (id) => {
  return request(`/admin/users/${id}`, {
    method: 'DELETE'
  });
};

export const toggleStudentSuspension = async (id) => {
  const { student } = await getStudent(id);

  const nextStatus =
    student.status === 'suspended' ? 'active' : 'suspended';

  await updateStudent(id, {
    ...student,
    status: nextStatus
  });

  return {
    student: {
      ...student,
      status: nextStatus
    }
  };
};

export const getTeachers = async () => {
  const data = await request('/admin/users');

  const teachers = data.users
    .filter((user) => user.role === 'teacher' || user.role === 'admin')
    .map(mapUserToTeacher);

  return { teachers };
};

export const updateTeacher = async (id, teacher) => {
  const body = {
    name: teacher.name,
    email: teacher.email,
    role: teacher.role || 'teacher',
    levels: Array.isArray(teacher.levels) ? teacher.levels : [],
    levelFocus: Array.isArray(teacher.levels)
      ? teacher.levels.join(', ')
      : teacher.levelFocus,
    language: teacher.language,
    isActive: teacher.status ? teacher.status !== 'suspended' : undefined
  };

  if (teacher.password && teacher.password.trim() !== '') {
    body.password = teacher.password;
  }

  const data = await request(`/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });

  return {
    success: data.success,
    teacher: {
      id,
      ...teacher,
      password: ''
    }
  };
};

export const deleteTeacher = async (id) => {
  return request(`/admin/users/${id}`, {
    method: 'DELETE'
  });
};

export const assignStudentsToTeacher = async (teacherId, studentIds) => {
  const updatedStudents = [];

  for (const studentId of studentIds) {
    const { student } = await getStudent(studentId);

    const currentTeacherIds = Array.isArray(student.teacherIds)
      ? student.teacherIds
      : [];

    const nextTeacherIds = [...new Set([...currentTeacherIds, teacherId])];

    await updateStudent(studentId, {
      ...student,
      teacherIds: nextTeacherIds
    });

    updatedStudents.push({
      id: studentId,
      teacherIds: nextTeacherIds
    });
  }

  return {
    teacher: { id: teacherId },
    students: updatedStudents
  };
};

export const createTeacher = async (teacher) => {
  const data = await request('/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: teacher.email,
      password: teacher.password || 'Test1234!',
      name: teacher.name,
      role: 'teacher',
      language: teacher.language || 'ar'
    })
  });

  return {
    teacher: mapUserToTeacher(data.user)
  };
};

export const createAdmin = async (admin) => {
  const data = await request('/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: admin.email,
      password: admin.password || 'Admin1234!',
      name: admin.name,
      role: 'admin',
      language: admin.language || 'ar'
    })
  });

  return {
    admin: {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      role: data.user.role
    }
  };
};

export const createUser = async (user) => {
  const data = await request('/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      name: user.name,
      role: user.role,
      language: user.language || 'ar',
      level: user.level || 'A1',
      levels: Array.isArray(user.levels) ? user.levels : [],
      levelFocus: Array.isArray(user.levels) ? user.levels.join(', ') : '',
      teacherIds: Array.isArray(user.teacherIds)
        ? user.teacherIds
        : []
    })
  });

  return {
    user: data.user
  };
};

export const getFullAnalytics = async ({ from, to, search } = {}) => {
  const params = new URLSearchParams();

  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (search) params.set('search', search);

  const query = params.toString();

  return request(`/admin/analytics/full${query ? `?${query}` : ''}`);
};