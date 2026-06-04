import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Ban,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import Button from '../../components/ui/Button.jsx';
import { adminLevels } from '../../data/adminMockData.js';
import {
  createStudent,
  deleteStudent,
  getStudents,
  getTeachers,
  toggleStudentSuspension,
  updateStudent,
} from '../../services/adminApi.js';
import { logout } from '../../services/auth.js';

const emptyForm = {
  email: '',
  level: 'א1',
  name: '',
  password: '',
  teacherIds: [],
};

const fieldClass =
  'rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100';

function getStudentTeacherIds(student) {
  if (Array.isArray(student.teacherIds)) {
    return student.teacherIds;
  }

  if (student.teacherId) {
    return [student.teacherId];
  }

  return [];
}

function teacherNames(teachers, teacherIds = []) {
  const names = teacherIds
    .map((teacherId) => teachers.find((teacher) => teacher.id === teacherId)?.name)
    .filter(Boolean);

  return names.length > 0 ? names.join(', ') : 'לא שויכה';
}

function Modal({ children, onClose, title, description }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <section
        className="w-full max-w-3xl rounded-[1.75rem] border border-white/80 bg-white p-5 shadow-2xl sm:p-6"
        dir="rtl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-950">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                {description}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-600 transition hover:bg-violet-50 hover:text-violet-700"
            aria-label="סגירה"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {children}
      </section>
    </div>
  );
}

function Field({ children, label }) {
  return (
    <label className="grid gap-2 text-sm font-black text-slate-700">
      {label}
      {children}
    </label>
  );
}

function StudentForm({ initialValue, mode, onCancel, onSubmit, saving, teachers }) {
  const [form, setForm] = useState({
    ...initialValue,
    teacherIds: getStudentTeacherIds(initialValue),
  });

  const isEdit = mode === 'edit';

  const setField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const toggleTeacher = (teacherId) => {
    setForm((current) => {
      const currentTeacherIds = Array.isArray(current.teacherIds)
        ? current.teacherIds
        : [];

      const nextTeacherIds = currentTeacherIds.includes(teacherId)
        ? currentTeacherIds.filter((id) => id !== teacherId)
        : [...currentTeacherIds, teacherId];

      return {
        ...current,
        teacherIds: nextTeacherIds,
      };
    });
  };

  const submitForm = (event) => {
    event.preventDefault();
    onSubmit({
      ...form,
      teacherIds: Array.isArray(form.teacherIds) ? form.teacherIds : [],
    });
  };

  return (
    <form className="mt-5 grid gap-4" onSubmit={submitForm}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="שם התלמידה">
          <input
            value={form.name}
            onChange={setField('name')}
            className={fieldClass}
            required
          />
        </Field>

        <Field label="אימייל">
          <input
            type="email"
            value={form.email}
            onChange={setField('email')}
            className={fieldClass}
            required
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={isEdit ? 'סיסמה חדשה (אופציונלי)' : 'סיסמה זמנית'}>
          <input
            type="password"
            value={form.password}
            onChange={setField('password')}
            className={fieldClass}
            required={!isEdit}
            placeholder={isEdit ? 'השאר ריק כדי לא לשנות סיסמה' : ''}
          />
        </Field>

        <Field label="רמת לימוד">
          <select value={form.level} onChange={setField('level')} className={fieldClass}>
            {adminLevels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-black text-slate-700">מורות משויכות</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          אפשר לבחור יותר ממורה אחת עבור אותה תלמידה.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {teachers.length === 0 ? (
            <p className="text-sm font-bold text-slate-500">
              אין מורות זמינות.
            </p>
          ) : (
            teachers.map((teacher) => {
              const selected = form.teacherIds.includes(teacher.id);

              return (
                <button
                  key={teacher.id}
                  type="button"
                  onClick={() => toggleTeacher(teacher.id)}
                  className={`rounded-2xl border px-4 py-3 text-right text-sm font-black transition ${
                    selected
                      ? 'border-violet-300 bg-violet-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-violet-50 hover:text-violet-700'
                  }`}
                >
                  {teacher.name}
                </button>
              );
            })
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {form.teacherIds.length === 0 ? (
            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500">
              לא שויכה
            </span>
          ) : (
            form.teacherIds.map((teacherId) => {
              const teacher = teachers.find((item) => item.id === teacherId);

              return (
                <span
                  key={teacherId}
                  className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700"
                >
                  {teacher?.name || teacherId}
                </span>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-200"
        >
          ביטול
        </button>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white shadow-button transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {saving ? 'שומרת...' : isEdit ? 'שמירת שינויים' : 'הוספת תלמידה'}
        </button>
      </div>
    </form>
  );
}

function StatusMessage({ children, type }) {
  const styles =
    type === 'success'
      ? 'border-green-100 bg-green-50 text-green-700'
      : 'border-red-100 bg-red-50 text-red-700';

  return (
    <p className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold leading-6 ${styles}`}>
      {children}
    </p>
  );
}

function ActionButton({ children, label, onClick, tone = 'violet' }) {
  const toneClass =
    tone === 'danger'
      ? 'hover:bg-red-50 hover:text-red-700'
      : tone === 'warning'
        ? 'hover:bg-amber-50 hover:text-amber-700'
        : 'hover:bg-violet-50 hover:text-violet-700';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-600 transition ${toneClass}`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function Students() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modal, setModal] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const [studentsData, teachersData] = await Promise.all([
        getStudents(),
        getTeachers(),
      ]);

      setStudents(studentsData.students || []);
      setTeachers(teachersData.teachers || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredStudents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return students;
    }

    return students.filter((student) => {
      const teacherIds = getStudentTeacherIds(student);
      const names = teacherNames(teachers, teacherIds);

      return `${student.name} ${student.email} ${student.level} ${names}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [query, students, teachers]);

  const closeModal = () => {
    setModal(null);
    setSelectedStudent(null);
  };

  const openAddModal = () => {
    setSelectedStudent(null);
    setSuccess('');
    setModal('add');
  };

  const submitCreate = async (form) => {
    setSaving(true);
    setError('');

    try {
      const data = await createStudent({
        ...form,
        teacherIds: getStudentTeacherIds(form),
      });

      setStudents((current) => [data.student, ...current]);
      setSuccess('התלמידה נוספה בהצלחה');
      closeModal();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const submitEdit = async (form) => {
    setSaving(true);
    setError('');

    try {
      const data = await updateStudent(selectedStudent.id, {
        email: form.email,
        level: form.level,
        name: form.name,
        password: form.password,
        teacherIds: getStudentTeacherIds(form),
      });

      setStudents((current) =>
        current.map((student) =>
          student.id === data.student.id ? data.student : student,
        ),
      );

      setSuccess('פרטי התלמידה עודכנו בהצלחה');
      closeModal();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setSaving(true);
    setError('');

    try {
      await deleteStudent(selectedStudent.id);
      setStudents((current) =>
        current.filter((student) => student.id !== selectedStudent.id),
      );
      setSuccess('התלמידה נמחקה');
      closeModal();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleSuspend = async (student) => {
    setError('');

    try {
      const data = await toggleStudentSuspension(student.id);

      setStudents((current) =>
        current.map((item) =>
          item.id === data.student.id ? data.student : item,
        ),
      );

      setSuccess(
        data.student.status === 'suspended'
          ? 'התלמידה הושהתה'
          : 'התלמידה הוחזרה לפעילות',
      );
    } catch (requestError) {
      setError(requestError.message);
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
          <button
            type="button"
            onClick={() => navigate('/admin/dashboard')}
            className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-black text-violet-700 shadow-sm transition hover:bg-violet-50"
          >
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
            חזרה ללוח הבקרה
          </button>

          <Button type="button" variant="secondary" onClick={handleLogout}>
            יציאה
          </Button>
        </header>

        <section className="mt-6 overflow-hidden rounded-[2rem] border border-white/70 bg-white/95 p-5 shadow-card sm:p-7">
          <p className="inline-flex items-center gap-2 text-sm font-black text-violet-700">
            <Users className="h-4 w-4" aria-hidden="true" />
            ניהול תלמידות
          </p>

          <h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-4xl">
            תלמידות במערכת
          </h1>

          <p className="mt-3 max-w-4xl text-sm font-semibold leading-7 text-slate-600 sm:text-base">
            ניהול תלמידות, רמות, שיוך למורות, עריכה, מחיקה והשהיה דרך המערכת.
          </p>
        </section>

        <section className="mt-5 rounded-[2rem] border border-white/70 bg-white/95 p-5 shadow-card sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="flex min-h-12 flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-violet-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-violet-100">
              <Search className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />

              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="חיפוש לפי שם, אימייל, רמה או מורה"
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
              />
            </label>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={loadData}
                disabled={loading}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-violet-50 px-4 text-sm font-black text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                רענון
              </button>

              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white shadow-button transition hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
              >
                <UserPlus className="h-5 w-5" aria-hidden="true" />
                הוספת תלמידה
              </button>
            </div>
          </div>

          {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
          {success ? <StatusMessage type="success">{success}</StatusMessage> : null}

          <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white">
            <div className="hidden grid-cols-[1fr_1.25fr_0.6fr_1.2fr_0.7fr_1.1fr] gap-3 bg-violet-50 px-4 py-3 text-xs font-black text-violet-700 md:grid">
              <span>שם</span>
              <span>אימייל</span>
              <span>רמה</span>
              <span>מורות</span>
              <span>סטטוס</span>
              <span>פעולות</span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-sm font-black text-slate-500">
                טוענת תלמידות...
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="grid justify-items-center gap-3 p-8 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                  <Users className="h-7 w-7" aria-hidden="true" />
                </span>
                <h2 className="text-base font-black text-slate-900">
                  לא נמצאו תלמידות
                </h2>
              </div>
            ) : (
              filteredStudents.map((student) => {
                const studentTeacherIds = getStudentTeacherIds(student);

                return (
                  <div
                    key={student.id}
                    className="grid gap-3 border-t border-slate-100 px-4 py-4 text-sm transition hover:bg-violet-50/30 md:grid-cols-[1fr_1.25fr_0.6fr_1.2fr_0.7fr_1.1fr] md:items-center"
                  >
                    <div>
                      <span className="mb-1 block text-xs font-black text-slate-400 md:hidden">
                        שם
                      </span>
                      <span className="font-black text-slate-900">{student.name}</span>
                    </div>

                    <div className="min-w-0">
                      <span className="mb-1 block text-xs font-black text-slate-400 md:hidden">
                        אימייל
                      </span>
                      <span className="block truncate font-semibold text-slate-600">
                        {student.email}
                      </span>
                    </div>

                    <div>
                      <span className="mb-1 block text-xs font-black text-slate-400 md:hidden">
                        רמה
                      </span>
                      <span className="inline-flex rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">
                        {student.level}
                      </span>
                    </div>

                    <div>
                      <span className="mb-1 block text-xs font-black text-slate-400 md:hidden">
                        מורות
                      </span>
                      <span className="font-semibold text-slate-600">
                        {teacherNames(teachers, studentTeacherIds)}
                      </span>
                    </div>

                    <div>
                      <span className="mb-1 block text-xs font-black text-slate-400 md:hidden">
                        סטטוס
                      </span>
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${
                          student.status === 'suspended'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-green-50 text-green-700'
                        }`}
                      >
                        {student.status === 'suspended' ? 'מושהית' : 'פעילה'}
                      </span>
                    </div>

                    <div>
                      <span className="mb-1 block text-xs font-black text-slate-400 md:hidden">
                        פעולות
                      </span>

                      <span className="flex flex-wrap gap-2">
                        <ActionButton
                          label="עריכת תלמידה"
                          onClick={() => {
                            setSelectedStudent(student);
                            setModal('edit');
                          }}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </ActionButton>

                        <ActionButton
                          label="השהיה או החזרה"
                          tone="warning"
                          onClick={() => toggleSuspend(student)}
                        >
                          {student.status === 'suspended' ? (
                            <UserCheck className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Ban className="h-4 w-4" aria-hidden="true" />
                          )}
                        </ActionButton>

                        <ActionButton
                          label="מחיקת תלמידה"
                          tone="danger"
                          onClick={() => {
                            setSelectedStudent(student);
                            setModal('delete');
                          }}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </ActionButton>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {modal === 'add' ? (
        <Modal
          title="הוספת תלמידה"
          description="יצירת תלמידה חדשה ושיוך למורה אחת או יותר."
          onClose={closeModal}
        >
          <StudentForm
            initialValue={emptyForm}
            mode="add"
            onCancel={closeModal}
            onSubmit={submitCreate}
            saving={saving}
            teachers={teachers}
          />
        </Modal>
      ) : null}

      {modal === 'edit' && selectedStudent ? (
        <Modal
          title="עריכת תלמידה"
          description="עדכון שם, אימייל, רמה ושיוך למורות."
          onClose={closeModal}
        >
          <StudentForm
            initialValue={{
              ...emptyForm,
              ...selectedStudent,
              teacherIds: getStudentTeacherIds(selectedStudent),
              password: '',
            }}
            mode="edit"
            onCancel={closeModal}
            onSubmit={submitEdit}
            saving={saving}
            teachers={teachers}
          />
        </Modal>
      ) : null}

      {modal === 'delete' && selectedStudent ? (
        <Modal title="מחיקת תלמידה" onClose={closeModal}>
          <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold leading-7 text-red-700">
            למחוק את {selectedStudent.name}? הפעולה תמחק את המשתמשת מהמערכת.
          </div>

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-200"
            >
              ביטול
            </button>

            <button
              type="button"
              onClick={confirmDelete}
              disabled={saving}
              className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'מוחקת...' : 'מחיקה'}
            </button>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

export default Students;
