import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  FilePlus2,
  GraduationCap,
  Link2,
  Pencil,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import Button from '../../components/ui/Button.jsx';
import {
  adminStudentsSeed,
  adminTeachersSeed,
} from '../../data/adminMockData.js';
import {
  assignStudentsToTeacher,
  createUser,
  deleteTeacher,
  getStudents,
  getTeachers,
  updateTeacher,
} from '../../services/adminApi.js';
import { logout } from '../../services/auth.js';

const fieldClass =
  'rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100';

function getStudentTeacherIds(student) {
  if (Array.isArray(student.teacherIds)) return student.teacherIds;
  if (student.teacherId) return [student.teacherId];
  return [];
}

function Modal({ children, onClose, title, description }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <section className="w-full max-w-3xl rounded-[1.75rem] border border-white/80 bg-white p-5 shadow-2xl sm:p-6" dir="rtl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-950">{title}</h2>
            {description ? <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function CreateUserForm({ onCancel, onSubmit, saving }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'teacher',
    language: 'ar',
    level: 'A1',
  });

  const setField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  return (
    <form className="mt-5 grid gap-4" onSubmit={(event) => {
      event.preventDefault();
      onSubmit(form);
    }}>
      <label className="grid gap-2 text-sm font-black text-slate-700">
        שם
        <input value={form.name} onChange={setField('name')} className={fieldClass} required />
      </label>

      <label className="grid gap-2 text-sm font-black text-slate-700">
        אימייל
        <input type="email" value={form.email} onChange={setField('email')} className={fieldClass} required />
      </label>

      <label className="grid gap-2 text-sm font-black text-slate-700">
        סיסמה
        <input type="password" value={form.password} onChange={setField('password')} className={fieldClass} required />
      </label>

      <label className="grid gap-2 text-sm font-black text-slate-700">
        תפקיד
        <select value={form.role} onChange={setField('role')} className={fieldClass}>
          <option value="teacher">Teacher</option>
          <option value="admin">Admin</option>
          <option value="student">Student</option>
        </select>
      </label>

      {form.role === 'student' ? (
        <label className="grid gap-2 text-sm font-black text-slate-700">
          רמה
          <select value={form.level} onChange={setField('level')} className={fieldClass}>
            <option value="A1">A1</option>
            <option value="A2">A2</option>
            <option value="B1">B1</option>
            <option value="B2">B2</option>
          </select>
        </label>
      ) : null}

      <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700">
          ביטול
        </button>
        <button type="submit" disabled={saving} className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white shadow-button">
          {saving ? 'יוצר...' : 'יצירת משתמש'}
        </button>
      </div>
    </form>
  );
}

function TeacherForm({ initialValue, onCancel, onSubmit, saving }) {
  const [form, setForm] = useState(initialValue);

  const setField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  return (
    <form className="mt-5 grid gap-4" onSubmit={(event) => {
      event.preventDefault();
      onSubmit(form);
    }}>
      <label className="grid gap-2 text-sm font-black text-slate-700">
        שם המורה
        <input value={form.name} onChange={setField('name')} className={fieldClass} required />
      </label>

      <label className="grid gap-2 text-sm font-black text-slate-700">
        אימייל
        <input type="email" value={form.email || ''} onChange={setField('email')} className={fieldClass} required />
      </label>

      <label className="grid gap-2 text-sm font-black text-slate-700">
        תפקיד
        <select value={form.role || 'teacher'} onChange={setField('role')} className={fieldClass}>
          <option value="teacher">Teacher</option>
          <option value="admin">Admin</option>
        </select>
      </label>

      <label className="grid gap-2 text-sm font-black text-slate-700">
        סיסמה חדשה optional
        <input type="password" value={form.password || ''} onChange={setField('password')} className={fieldClass} placeholder="השאר ריק כדי לא לשנות" />
      </label>

      <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700">
          ביטול
        </button>
        <button type="submit" disabled={saving} className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white shadow-button">
          {saving ? 'שומרת...' : 'שמירת שינויים'}
        </button>
      </div>
    </form>
  );
}

function AssignmentForm({ allStudents, assignedIds, onCancel, onSubmit, saving, teacher }) {
  const [selectedIds, setSelectedIds] = useState(assignedIds);

  const toggleStudent = (id) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((studentId) => studentId !== id)
        : [...current, id],
    );
  };

  return (
    <form className="mt-5 grid gap-4" onSubmit={(event) => {
      event.preventDefault();
      onSubmit(selectedIds);
    }}>
      <div className="grid max-h-80 gap-2 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50 p-3">
        {allStudents.map((student) => {
          const checked = selectedIds.includes(student.id);

          return (
            <label key={student.id} className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition ${checked ? 'bg-violet-600 text-white' : 'bg-white text-slate-700'}`}>
              <span>{student.name} · {student.level}</span>
              <input type="checkbox" checked={checked} onChange={() => toggleStudent(student.id)} className="h-4 w-4" />
            </label>
          );
        })}
      </div>

      <p className="text-sm font-semibold text-slate-500">
        השיוך יתעדכן עבור {teacher.name}.
      </p>

      <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700">
          ביטול
        </button>
        <button type="submit" disabled={saving} className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white shadow-button">
          {saving ? 'משייכת...' : 'שמירת שיוך'}
        </button>
      </div>
    </form>
  );
}

function TeachersManagement() {
  const navigate = useNavigate();

  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [modal, setModal] = useState(null);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [saving, setSaving] = useState(false);
  const [usesLocalData, setUsesLocalData] = useState(false);
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      setError('');

      const [teachersData, studentsData] = await Promise.all([
        getTeachers(),
        getStudents(),
      ]);

      if (
        (teachersData.teachers || []).length === 0 &&
        (studentsData.students || []).length === 0
      ) {
        setTeachers(adminTeachersSeed);
        setStudents(adminStudentsSeed);
        setUsesLocalData(true);
      } else {
        setTeachers(teachersData.teachers || []);
        setStudents(studentsData.students || []);
        setUsesLocalData(false);
      }
    } catch (requestError) {
      setTeachers(adminTeachersSeed);
      setStudents(adminStudentsSeed);
      setUsesLocalData(true);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const studentsByTeacher = useMemo(() => {
    return teachers.reduce((acc, teacher) => {
      acc[teacher.id] = students.filter((student) =>
        getStudentTeacherIds(student).includes(teacher.id),
      );
      return acc;
    }, {});
  }, [students, teachers]);

  const closeModal = () => {
    setModal(null);
    setSelectedTeacher(null);
  };

  const submitCreateUser = async (form) => {
    try {
      setSaving(true);
      if (usesLocalData) {
        const user = {
          ...form,
          id: `${form.role}_${Date.now()}`,
          status: 'active',
          teacherIds: [],
        };

        if (form.role === 'student') {
          setStudents((current) => [user, ...current]);
        } else {
          setTeachers((current) => [user, ...current]);
        }

        closeModal();
        return;
      }

      await createUser(form);
      await loadData();
      closeModal();
    } catch (error) {
      console.error('Failed to create user:', error);
    } finally {
      setSaving(false);
    }
  };

  const submitTeacherEdit = async (form) => {
    try {
      setSaving(true);
      if (usesLocalData) {
        setTeachers((current) =>
          current.map((teacher) =>
            teacher.id === selectedTeacher.id
              ? { ...teacher, ...form, password: '' }
              : teacher,
          ),
        );
        closeModal();
        return;
      }

      const data = await updateTeacher(selectedTeacher.id, form);
      setTeachers((current) =>
        current.map((teacher) =>
          teacher.id === data.teacher.id ? data.teacher : teacher,
        ),
      );
      await loadData();
      closeModal();
    } catch (error) {
      console.error('Failed to update teacher:', error);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    try {
      setSaving(true);
      if (usesLocalData) {
        setTeachers((current) =>
          current.filter((teacher) => teacher.id !== selectedTeacher.id),
        );
        setStudents((current) =>
          current.map((student) => ({
            ...student,
            teacherIds: getStudentTeacherIds(student).filter(
              (teacherId) => teacherId !== selectedTeacher.id,
            ),
          })),
        );
        closeModal();
        return;
      }

      await deleteTeacher(selectedTeacher.id);
      await loadData();
      closeModal();
    } catch (error) {
      console.error('Failed to delete teacher:', error);
    } finally {
      setSaving(false);
    }
  };

  const submitAssignments = async (studentIds) => {
    try {
      setSaving(true);
      if (usesLocalData) {
        setStudents((current) =>
          current.map((student) => {
            const remainingTeacherIds = getStudentTeacherIds(student).filter(
              (teacherId) => teacherId !== selectedTeacher.id,
            );

            return studentIds.includes(student.id)
              ? {
                  ...student,
                  teacherIds: [...remainingTeacherIds, selectedTeacher.id],
                  teacherId: selectedTeacher.id,
                }
              : {
                  ...student,
                  teacherIds: remainingTeacherIds,
                  teacherId: remainingTeacherIds[0] || '',
                };
          }),
        );
        closeModal();
        return;
      }

      await assignStudentsToTeacher(selectedTeacher.id, studentIds);
      await loadData();
      closeModal();
    } catch (error) {
      console.error('Failed to assign students:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_52%,#F8F5FF_100%)] px-3 py-4 text-slate-900 sm:px-4 sm:py-6 md:px-6 md:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-7xl" dir="rtl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => navigate('/admin/dashboard')} className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-black text-violet-700 shadow-sm transition hover:bg-violet-50">
            <ArrowRight className="h-4 w-4" />
            חזרה ללוח הבקרה
          </button>

          <Button type="button" variant="secondary" onClick={handleLogout}>
            יציאה
          </Button>
        </header>

        <section className="mt-6 overflow-hidden rounded-[2rem] border border-white/70 bg-white/95 p-5 shadow-card sm:p-7">
          <p className="inline-flex items-center gap-2 text-sm font-black text-violet-700">
            <GraduationCap className="h-4 w-4" />
            ניהול משתמשים ומורות
          </p>

          <h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-4xl">
            מורות, אדמינים ושיוך תלמידות
          </h1>

          <p className="mt-3 max-w-4xl text-sm font-semibold leading-7 text-slate-600 sm:text-base">
            ניהול מורות, יצירת אדמינים חדשים ושיוך תלמידות למורה אחת או יותר.
          </p>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => setModal('create-user')} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white shadow-button transition hover:bg-violet-700">
              <UserPlus className="h-5 w-5" />
              הוספת משתמש
            </button>

            <button
              type="button"
              onClick={() => navigate('/teacher/stories/upload')}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-50 px-5 py-3 text-sm font-black text-violet-700 transition hover:bg-violet-100"
            >
              <FilePlus2 className="h-5 w-5" />
              הוספת חומר לימוד
            </button>
          </div>
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-3">
          {teachers.map((teacher) => {
            const assignedStudents = studentsByTeacher[teacher.id] || [];

            return (
              <article key={teacher.id} className="rounded-[1.75rem] border border-violet-100/70 bg-white/95 p-5 shadow-card">
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                    <GraduationCap className="h-6 w-6" />
                  </span>

                  <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">
                    {assignedStudents.length} תלמידות
                  </span>
                </div>

                <h2 className="mt-5 text-lg font-black text-slate-950">
                  {teacher.name}
                </h2>

                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  {teacher.email}
                </p>

                <p className="mt-1 text-sm font-bold text-violet-700">
                  תפקיד: {teacher.role}
                </p>

                <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs font-black text-slate-400">
                    תלמידות משויכות
                  </p>

                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                    {assignedStudents.length
                      ? assignedStudents.map((student) => `${student.name} (${student.level})`).join(', ')
                      : 'אין תלמידות משויכות'}
                  </p>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button type="button" onClick={() => {
                    setSelectedTeacher(teacher);
                    setModal('edit');
                  }} className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-100">
                    <Pencil className="h-4 w-4" />
                    עריכה
                  </button>

                  <button type="button" onClick={() => {
                    setSelectedTeacher(teacher);
                    setModal('assign');
                  }} className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-100">
                    <Link2 className="h-4 w-4" />
                    שיוך תלמידות
                  </button>

                  <button type="button" onClick={() => {
                    setSelectedTeacher(teacher);
                    setModal('delete');
                  }} className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100">
                    <Trash2 className="h-4 w-4" />
                    מחיקה
                  </button>
                </div>
              </article>
            );
          })}
        </section>

        <section className="mt-5 rounded-[1.75rem] border border-violet-100/70 bg-white/95 p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
              <Users className="h-5 w-5" />
            </span>

            <h2 className="text-lg font-black text-slate-950">
              מבט כללי על שיוכים
            </h2>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {students.map((student) => {
              const teacherIds = getStudentTeacherIds(student);
              const teacherNames = teacherIds
                .map((id) => teachers.find((teacher) => teacher.id === id)?.name)
                .filter(Boolean);

              return (
                <div key={student.id} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                  {student.name} · {student.level} ·{' '}
                  {teacherNames.length > 0 ? teacherNames.join(', ') : 'לא שויכה'}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {modal === 'create-user' ? (
        <Modal title="הוספת משתמש חדש" description="יצירת תלמידה, מורה או אדמין חדש." onClose={closeModal}>
          <CreateUserForm onCancel={closeModal} onSubmit={submitCreateUser} saving={saving} />
        </Modal>
      ) : null}

      {modal === 'edit' && selectedTeacher ? (
        <Modal title="עריכת משתמש" description="עדכון פרטי מורה או אדמין." onClose={closeModal}>
          <TeacherForm initialValue={{ ...selectedTeacher, password: '' }} onCancel={closeModal} onSubmit={submitTeacherEdit} saving={saving} />
        </Modal>
      ) : null}

      {modal === 'assign' && selectedTeacher ? (
        <Modal title="שיוך תלמידות" description="בחירת תלמידות שישויכו למורה." onClose={closeModal}>
          <AssignmentForm
            allStudents={students}
            assignedIds={students
              .filter((student) => getStudentTeacherIds(student).includes(selectedTeacher.id))
              .map((student) => student.id)}
            onCancel={closeModal}
            onSubmit={submitAssignments}
            saving={saving}
            teacher={selectedTeacher}
          />
        </Modal>
      ) : null}

      {modal === 'delete' && selectedTeacher ? (
        <Modal title="מחיקת משתמש" onClose={closeModal}>
          <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold leading-7 text-red-700">
            למחוק את {selectedTeacher.name}?
          </div>

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={closeModal} className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700">
              ביטול
            </button>

            <button type="button" onClick={confirmDelete} disabled={saving} className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white">
              {saving ? 'מוחקת...' : 'מחיקה'}
            </button>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

export default TeachersManagement;
