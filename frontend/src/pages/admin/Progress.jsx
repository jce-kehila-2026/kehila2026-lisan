import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  GraduationCap,
  Link2,
  Pencil,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button.jsx';
import {
  assignStudentsToTeacher,
  deleteTeacher,
  getStudents,
  getTeachers,
  updateTeacher,
} from '../../services/adminApi.js';
import { logout } from '../../services/auth.js';

const fieldClass =
  'rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100';

function Modal({ children, onClose, title, description }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <section
        className="w-full max-w-xl rounded-[1.75rem] border border-white/80 bg-white p-5 shadow-2xl sm:p-6"
        dir="rtl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-950">{title}</h2>
            {description ? <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{description}</p> : null}
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

function TeacherForm({ initialValue, onCancel, onSubmit, saving }) {
  const [form, setForm] = useState(initialValue);

  const setField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  return (
    <form
      className="mt-5 grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
    >
      <label className="grid gap-2 text-sm font-black text-slate-700">
        שם המורה
        <input value={form.name} onChange={setField('name')} className={fieldClass} required />
      </label>
      <label className="grid gap-2 text-sm font-black text-slate-700">
        מיקוד רמות / כיתות
        <input value={form.levelFocus} onChange={setField('levelFocus')} className={fieldClass} required />
      </label>
      <label className="grid gap-2 text-sm font-black text-slate-700">
        שם קבוצה
        <input value={form.className} onChange={setField('className')} className={fieldClass} required />
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
      current.includes(id) ? current.filter((studentId) => studentId !== id) : [...current, id],
    );
  };

  return (
    <form
      className="mt-5 grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(selectedIds);
      }}
    >
      <div className="grid max-h-80 gap-2 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50 p-3">
        {allStudents.map((student) => {
          const checked = selectedIds.includes(student.id);
          return (
            <label
              key={student.id}
              className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition ${
                checked ? 'bg-violet-600 text-white' : 'bg-white text-slate-700'
              }`}
            >
              <span>
                {student.name} · {student.level}
              </span>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleStudent(student.id)}
                className="h-4 w-4"
              />
            </label>
          );
        })}
      </div>
      <p className="text-sm font-semibold text-slate-500">
        השיוך יתעדכן בדמו המקומי עבור {teacher.name}.
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

  const loadData = async () => {
    const [teachersData, studentsData] = await Promise.all([getTeachers(), getStudents()]);
    setTeachers(teachersData.teachers || []);
    setStudents(studentsData.students || []);
  };

  useEffect(() => {
    loadData();
  }, []);

  const studentsByTeacher = useMemo(() => {
    return teachers.reduce((acc, teacher) => {
      acc[teacher.id] = students.filter((student) => student.teacherId === teacher.id);
      return acc;
    }, {});
  }, [students, teachers]);

  const closeModal = () => {
    setModal(null);
    setSelectedTeacher(null);
  };

  const submitTeacherEdit = async (form) => {
    setSaving(true);
    const data = await updateTeacher(selectedTeacher.id, form);
    setTeachers((current) => current.map((teacher) => (teacher.id === data.teacher.id ? data.teacher : teacher)));
    setSaving(false);
    closeModal();
  };

  const confirmDelete = async () => {
    setSaving(true);
    await deleteTeacher(selectedTeacher.id);
    await loadData();
    setSaving(false);
    closeModal();
  };

  const submitAssignments = async (studentIds) => {
    setSaving(true);
    const data = await assignStudentsToTeacher(selectedTeacher.id, studentIds);
    setStudents(data.students || []);
    setSaving(false);
    closeModal();
  };

  const handleLogout = () => {
    logout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_52%,#F8F5FF_100%)] px-4 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl" dir="rtl">
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
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
            ניהול מורות
          </p>
          <h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-4xl">מורות ושיוך תלמידות</h1>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-slate-600 sm:text-base">
            צפייה במורות, רמות לימוד, כיתות ושיוך תלמידות למורות בדמו מקומי בלבד.
          </p>
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-3">
          {teachers.map((teacher) => {
            const assignedStudents = studentsByTeacher[teacher.id] || [];
            return (
              <article key={teacher.id} className="rounded-[1.75rem] border border-violet-100/70 bg-white/95 p-5 shadow-card">
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                    <GraduationCap className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">
                    {assignedStudents.length} תלמידות
                  </span>
                </div>
                <h2 className="mt-5 text-lg font-black text-slate-950">{teacher.name}</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{teacher.className}</p>
                <p className="mt-1 text-sm font-bold text-violet-700">רמות: {teacher.levelFocus}</p>

                <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs font-black text-slate-400">תלמידות משויכות</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                    {assignedStudents.length
                      ? assignedStudents.map((student) => `${student.name} (${student.level})`).join(', ')
                      : 'אין תלמידות משויכות'}
                  </p>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTeacher(teacher);
                      setModal('edit');
                    }}
                    className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-100"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    עריכה
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTeacher(teacher);
                      setModal('assign');
                    }}
                    className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-100"
                  >
                    <Link2 className="h-4 w-4" aria-hidden="true" />
                    שיוך תלמידות
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTeacher(teacher);
                      setModal('delete');
                    }}
                    className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
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
              <Users className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="text-lg font-black text-slate-950">מבט כללי על שיוכים</h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {students.map((student) => (
              <div key={student.id} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                {student.name} · {student.level} ·{' '}
                {teachers.find((teacher) => teacher.id === student.teacherId)?.name || 'לא שויכה'}
              </div>
            ))}
          </div>
        </section>
      </div>

      {modal === 'edit' && selectedTeacher ? (
        <Modal title="עריכת מורה" description="עדכון פרטי מורה בדמו המקומי." onClose={closeModal}>
          <TeacherForm initialValue={selectedTeacher} onCancel={closeModal} onSubmit={submitTeacherEdit} saving={saving} />
        </Modal>
      ) : null}

      {modal === 'assign' && selectedTeacher ? (
        <Modal title="שיוך תלמידות" description="בחירת תלמידות שישויכו למורה." onClose={closeModal}>
          <AssignmentForm
            allStudents={students}
            assignedIds={students.filter((student) => student.teacherId === selectedTeacher.id).map((student) => student.id)}
            onCancel={closeModal}
            onSubmit={submitAssignments}
            saving={saving}
            teacher={selectedTeacher}
          />
        </Modal>
      ) : null}

      {modal === 'delete' && selectedTeacher ? (
        <Modal title="מחיקת מורה" onClose={closeModal}>
          <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold leading-7 text-red-700">
            למחוק את {selectedTeacher.name}? תלמידות משויכות יסומנו ללא מורה.
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
