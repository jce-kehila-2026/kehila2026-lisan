import React, { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  GraduationCap,
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
import Button from '../../components/ui/Button.jsx';
import AdminPageHeader from '../../components/admin/AdminPageHeader.jsx';
import AdminHeroVisual from '../../components/admin/AdminHeroVisual.jsx';
import {
  adminLevels,
  adminStudentsSeed,
  adminTeachersSeed,
} from '../../data/adminMockData.js';
import {
  createStudent,
  deleteStudent,
  getStudents,
  getTeachers,
  toggleStudentSuspension,
  updateStudent,
} from '../../services/adminApi.js';

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
  const [teachersOpen, setTeachersOpen] = useState(false);

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

      <div className="rounded-3xl border border-[#EEE5FF] bg-white p-4 shadow-sm">
        <p className="text-sm font-black text-slate-800">מורות שנבחרו</p>

        <div className="relative mt-3">
          <button
            type="button"
            onClick={() => setTeachersOpen((current) => !current)}
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-[#EEE5FF] bg-slate-50 px-4 text-right text-sm font-black text-slate-700 transition hover:bg-violet-50 focus:outline-none focus:ring-4 focus:ring-violet-100"
            aria-expanded={teachersOpen}
          >
            <span>
              {form.teacherIds.length > 0
                ? `${form.teacherIds.length} מורות נבחרו`
                : 'בחרי מורות'}
            </span>
            <span className="text-lg leading-none text-violet-600" aria-hidden="true">
              {teachersOpen ? '−' : '+'}
            </span>
          </button>

          {teachersOpen ? (
            <div className="absolute left-0 right-0 top-full z-10 mt-2 max-h-56 overflow-y-auto rounded-2xl border border-[#EEE5FF] bg-white shadow-xl">
              {teachers.length === 0 ? (
                <div className="px-4 py-3 text-sm font-bold text-slate-500">
                  אין מורות זמינות
                </div>
              ) : (
                <div className="divide-y divide-[#EEE5FF]">
                  {teachers.map((teacher) => {
                    const selected = form.teacherIds.includes(teacher.id);

                    return (
                      <button
                        key={teacher.id}
                        type="button"
                        onClick={() => toggleTeacher(teacher.id)}
                        className={`grid min-h-12 w-full grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2 text-right text-sm transition ${
                          selected
                            ? 'bg-violet-50 text-violet-800'
                            : 'bg-white text-slate-700 hover:bg-violet-50/70'
                        }`}
                      >
                        <span className="truncate font-black">{teacher.name}</span>
                        <GraduationCap
                          className="h-4 w-4 text-violet-600"
                          aria-hidden="true"
                        />
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs font-black ${
                            selected
                              ? 'border-violet-500 bg-violet-600 text-white'
                              : 'border-slate-300 bg-white text-transparent'
                          }`}
                          aria-hidden="true"
                        >
                          ✓
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
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

function FilterSelect({ label, value, onChange, children }) {
  return (
    <label className="grid gap-1 text-xs font-black text-slate-500">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-700 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
      >
        {children}
      </select>
    </label>
  );
}

function Students() {
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [query, setQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [teacherFilter, setTeacherFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [usesLocalData, setUsesLocalData] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modal, setModal] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedTeacher, setSelectedTeacher] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const [studentsData, teachersData] = await Promise.all([
        getStudents(),
        getTeachers(),
      ]);

      if (
        (studentsData.students || []).length === 0 &&
        (teachersData.teachers || []).length === 0
      ) {
        setStudents(adminStudentsSeed);
        setTeachers(adminTeachersSeed);
        setUsesLocalData(true);
      } else {
        setStudents(studentsData.students || []);
        setTeachers(teachersData.teachers || []);
        setUsesLocalData(false);
      }
    } catch (requestError) {
      setStudents(adminStudentsSeed);
      setTeachers(adminTeachersSeed);
      setUsesLocalData(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredStudents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return students.filter((student) => {
      const teacherIds = getStudentTeacherIds(student);
      const names = teacherNames(teachers, teacherIds);
      const matchesQuery = !normalizedQuery || `${student.name} ${student.email} ${student.level} ${names}`
        .toLowerCase()
        .includes(normalizedQuery);
      const matchesLevel = levelFilter === 'all' || student.level === levelFilter;
      const matchesTeacher =
        teacherFilter === 'all' || teacherIds.includes(teacherFilter);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'blocked'
          ? student.status === 'suspended'
          : student.status !== 'suspended');

      return matchesQuery && matchesLevel && matchesTeacher && matchesStatus;
    });
  }, [levelFilter, query, statusFilter, students, teacherFilter, teachers]);

  const closeModal = () => {
    setModal(null);
    setSelectedStudent(null);
    setSelectedTeacher(null);
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
      if (usesLocalData) {
        const newStudent = {
          ...form,
          id: `student_${Date.now()}`,
          status: 'active',
          teacherIds: getStudentTeacherIds(form),
        };

        setStudents((current) => [newStudent, ...current]);
        setSuccess('התלמידה נוספה בהצלחה');
        closeModal();
        return;
      }

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
      if (usesLocalData) {
        const updatedStudent = {
          ...selectedStudent,
          ...form,
          password: '',
          teacherIds: getStudentTeacherIds(form),
        };

        setStudents((current) =>
          current.map((student) =>
            student.id === selectedStudent.id ? updatedStudent : student,
          ),
        );
        setSuccess('פרטי התלמידה עודכנו בהצלחה');
        closeModal();
        return;
      }

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
      if (usesLocalData) {
        setStudents((current) =>
          current.filter((student) => student.id !== selectedStudent.id),
        );
        setSuccess('התלמידה נמחקה');
        closeModal();
        return;
      }

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
      if (usesLocalData) {
        const nextStatus = student.status === 'suspended' ? 'active' : 'suspended';

        setStudents((current) =>
          current.map((item) =>
            item.id === student.id ? { ...item, status: nextStatus } : item,
          ),
        );
        setSuccess(
          nextStatus === 'suspended'
            ? 'התלמידה הושהתה'
            : 'התלמידה הוחזרה לפעילות',
        );
        return;
      }

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

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#FCF8FF_0%,#F7F0FF_45%,#FFF6FB_100%)] px-3 py-3 text-slate-900 md:px-6 md:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-7xl" dir="rtl">
        <AdminPageHeader icon={Users} label="ניהול תלמידות" />

<section
          className="relative mt-8 overflow-hidden rounded-[24px] border border-violet-100/70 bg-white/75 shadow-[0_16px_42px_rgba(109,40,217,0.1)] md:mt-10 md:rounded-[28px]"
          style={{ maxHeight: '140px' }}
        >
          <div className="flex h-full min-h-[140px] items-stretch" dir="ltr">
            <div className="relative w-[34%] shrink-0 overflow-hidden" aria-hidden="true">
              <AdminHeroVisual type="students" />
            </div>
            <div className="flex flex-1 flex-col justify-center text-right" style={{ paddingLeft: '4px', paddingRight: '20px' }} dir="rtl">
              <p className="inline-flex w-full items-center justify-start gap-2 text-xs font-black text-violet-700 mb-1 text-right">
                <Users className="h-4 w-4" aria-hidden="true" />
                ניהול תלמידות
              </p>
              <h1 className="text-2xl font-black leading-tight text-slate-950 md:text-3xl">תלמידות במערכת</h1>
              <p className="mt-1 text-sm font-semibold text-slate-600">ניהול תלמידות, רמות, שיוך למורות, עריכה, מחיקה והשהיה דרך המערכת.</p>
              
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[2rem] border border-[#EEE5FF] bg-white/75 p-5 shadow-card backdrop-blur-[8px] sm:p-6">
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

            <div className="grid gap-2 sm:grid-cols-3 lg:w-[34rem]">
              <FilterSelect label="רמה" value={levelFilter} onChange={setLevelFilter}>
                <option value="all">כל הרמות</option>
                {adminLevels.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </FilterSelect>

              <FilterSelect label="מורה" value={teacherFilter} onChange={setTeacherFilter}>
                <option value="all">כל המורות</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.name}
                  </option>
                ))}
              </FilterSelect>

              <FilterSelect label="סטטוס" value={statusFilter} onChange={setStatusFilter}>
                <option value="all">כולן</option>
                <option value="active">לא חסומות</option>
                <option value="blocked">חסומות</option>
              </FilterSelect>
            </div>

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

          <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-[#EEE5FF] bg-white">
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
                    className="grid grid-cols-3 gap-x-2 gap-y-2 border-t border-[#EEE5FF] px-3 py-3 text-sm transition hover:bg-violet-50/30 md:grid-cols-[1fr_1.25fr_0.6fr_1.2fr_0.7fr_1.1fr] md:items-center md:gap-3 md:px-4 md:py-4"
                  >
                    <div className="col-span-3 md:col-span-1">
                      <span className="block font-black leading-5 text-slate-900">
                        {student.name}
                      </span>
                    </div>

                    <div className="col-span-3 min-w-0 md:col-span-1">
                      <span className="block whitespace-normal break-all text-xs font-semibold leading-5 text-slate-600 md:truncate md:whitespace-nowrap md:break-normal md:text-sm md:leading-normal">
                        {student.email}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <span className="mb-0.5 block text-[10px] font-black text-slate-400 md:hidden">
                        רמה
                      </span>
                      <span className="inline-flex max-w-full rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-black text-violet-700 md:px-3 md:py-1 md:text-xs">
                        {student.level}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <span className="mb-0.5 block text-[10px] font-black text-slate-400 md:hidden">
                        מורות
                      </span>
                      {studentTeacherIds.length === 0 ? (
                        <span className="block truncate text-xs font-semibold text-slate-600 md:text-sm">
                          לא שויכה
                        </span>
                      ) : (
                        <span className="flex max-h-9 flex-wrap gap-1 overflow-hidden md:max-h-none md:gap-2 md:overflow-visible">
                          {studentTeacherIds.map((teacherId) => {
                            const teacher = teachers.find((item) => item.id === teacherId);

                            return (
                              <button
                                key={teacherId}
                                type="button"
                                onClick={() => {
                                  setSelectedTeacher(teacher || { id: teacherId, name: teacherId });
                                  setModal('teacher-students');
                                }}
                                className="max-w-full truncate rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-black text-violet-700 transition hover:bg-violet-100 md:px-3 md:py-1 md:text-xs"
                              >
                                {teacher?.name || teacherId}
                              </button>
                            );
                          })}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <span className="mb-0.5 block text-[10px] font-black text-slate-400 md:hidden">
                        סטטוס
                      </span>
                      <span
                        className={`inline-flex max-w-full rounded-full px-2 py-0.5 text-[11px] font-black md:px-3 md:py-1 md:text-xs ${
                          student.status === 'suspended'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-green-50 text-green-700'
                        }`}
                      >
                        {student.status === 'suspended' ? 'מושהית' : 'פעילה'}
                      </span>
                    </div>

                    <div className="col-span-3 md:col-span-1">
                      <span className="flex flex-wrap justify-end gap-2 md:justify-start">
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

      {modal === 'teacher-students' && selectedTeacher ? (
        <Modal
          title={`תלמידות של ${selectedTeacher.name}`}
          description="רשימת התלמידות המשויכות למורה שנבחרה."
          onClose={closeModal}
        >
          <div className="mt-5 grid gap-3">
            {students
              .filter((student) =>
                getStudentTeacherIds(student).includes(selectedTeacher.id),
              )
              .map((student) => (
                <article
                  key={student.id}
                  className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-black text-slate-950">
                        {student.name}
                      </h3>
                      <p className="mt-1 text-sm font-semibold text-slate-600">
                        {student.email}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-violet-700">
                      {student.level}
                    </span>
                  </div>
                </article>
              ))}
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

export default Students;
