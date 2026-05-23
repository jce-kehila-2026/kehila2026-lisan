const API_BASE_URL = 'http://localhost:3000/api';

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

const mapUserToStudent = (user) => ({
  id: user.id,
  name: user.name || '',
  email: user.email || '',
  level: user.level || 'A1',
  language: user.language || 'ar',
  role: user.role || 'student',
  status: user.isActive === false ? 'suspended' : 'active',
  teacherId: user.teacherId || '',
  lastLoginAt: user.lastLoginAt || null,
  createdAt: user.createdAt || null
});

const mapUserToTeacher = (user) => ({
  id: user.id,
  name: user.name || '',
  email: user.email || '',
  role: user.role || 'teacher',
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
      language: student.language || 'ar'
    })
  });

  return {
    student: mapUserToStudent(data.user)
  };
};

export const updateStudent = async (id, student) => {
  const data = await request(`/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: student.name,
      level: student.level,
      language: student.language,
      isActive: student.status ? student.status !== 'suspended' : undefined
    })
  });

  return {
    success: data.success,
    student: {
      id,
      ...student
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
    .filter((user) => user.role === 'teacher' || user.role === 'expert')
    .map(mapUserToTeacher);

  return { teachers };
};

export const updateTeacher = async (id, teacher) => {
  const data = await request(`/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: teacher.name,
      role: teacher.role || 'teacher',
      language: teacher.language,
      isActive: teacher.status ? teacher.status !== 'suspended' : undefined
    })
  });

  return {
    success: data.success,
    teacher: {
      id,
      ...teacher
    }
  };
};

export const deleteTeacher = async (id) => {
  return request(`/admin/users/${id}`, {
    method: 'DELETE'
  });
};

export const assignStudentsToTeacher = async (teacherId, studentIds) => {
  // Backend teacher-student assignment is not implemented yet.
  // Keep this function so the UI does not break.
  return {
    teacher: { id: teacherId },
    students: studentIds.map((id) => ({
      id,
      teacherId
    }))
  };
};