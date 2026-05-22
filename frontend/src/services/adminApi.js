import { adminStudentsSeed, adminTeachersSeed } from '../data/adminMockData.js';

let students = adminStudentsSeed.map((student) => ({ ...student }));
let teachers = adminTeachersSeed.map((teacher) => ({ ...teacher }));

const wait = () => new Promise((resolve) => window.setTimeout(resolve, 120));

export const getStudents = async () => {
  await wait();
  return { students: students.map((student) => ({ ...student })) };
};

export const getStudent = async (id) => {
  await wait();
  const student = students.find((item) => item.id === id);

  if (!student) {
    throw new Error('התלמידה לא נמצאה');
  }

  return { student: { ...student } };
};

export const createStudent = async (student) => {
  await wait();
  const exists = students.some((item) => item.email.toLowerCase() === student.email.toLowerCase());

  if (exists) {
    throw new Error('כבר קיימת תלמידה עם האימייל הזה');
  }

  const nextStudent = {
    id: `student_${Date.now()}`,
    status: 'active',
    teacherId: 'teacher_001',
    ...student,
  };

  students = [nextStudent, ...students];
  return { student: { ...nextStudent } };
};

export const updateStudent = async (id, student) => {
  await wait();
  const exists = students.some((item) => item.id === id);

  if (!exists) {
    throw new Error('התלמידה לא נמצאה');
  }

  students = students.map((item) => (item.id === id ? { ...item, ...student } : item));
  return { student: { ...students.find((item) => item.id === id) } };
};

export const deleteStudent = async (id) => {
  await wait();
  students = students.filter((student) => student.id !== id);
  return { success: true };
};

export const toggleStudentSuspension = async (id) => {
  await wait();
  const student = students.find((item) => item.id === id);

  if (!student) {
    throw new Error('התלמידה לא נמצאה');
  }

  const status = student.status === 'suspended' ? 'active' : 'suspended';
  students = students.map((item) => (item.id === id ? { ...item, status } : item));
  return { student: { ...student, status } };
};

export const getTeachers = async () => {
  await wait();
  return { teachers: teachers.map((teacher) => ({ ...teacher })) };
};

export const updateTeacher = async (id, teacher) => {
  await wait();
  teachers = teachers.map((item) => (item.id === id ? { ...item, ...teacher } : item));
  return { teacher: { ...teachers.find((item) => item.id === id) } };
};

export const deleteTeacher = async (id) => {
  await wait();
  teachers = teachers.filter((teacher) => teacher.id !== id);
  students = students.map((student) =>
    student.teacherId === id ? { ...student, teacherId: '' } : student,
  );
  return { success: true };
};

export const assignStudentsToTeacher = async (teacherId, studentIds) => {
  await wait();
  students = students.map((student) =>
    studentIds.includes(student.id) ? { ...student, teacherId } : student,
  );
  return {
    teacher: { ...teachers.find((teacher) => teacher.id === teacherId) },
    students: students.map((student) => ({ ...student })),
  };
};
