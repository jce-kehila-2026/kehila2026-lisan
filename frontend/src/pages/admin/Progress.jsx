import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  GraduationCap,
  Link2,
  Pencil,
  Search,
  Trash2,
  UserPlus,
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
  assignStudentsToTeacher,
  createUser,
  deleteTeacher,
  getStudents,
  getTeachers,
  updateTeacher,
} from '../../services/adminApi.js';

const fieldClass =
  'rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100';

function getStudentTeacherIds(student) {
  if (Array.isArray(student.teacherIds)) return student.teacherIds;
  if (student.teacherId) return [student.teacherId];
  return [];
}

function getTeacherLevels(teacher) {
  if (Array.isArray(teacher?.levels) && teacher.levels.length > 0) {
    return teacher.levels;
  }

  if (teacher?.level) {
    return [teacher.level];
  }

  if (teacher?.levelFocus) {
    return teacher.levelFocus
      .split(',')
      .map((level) => level.trim())
      .filter(Boolean);
  }

  return [];
}

function getTeachersLayoutClass() {
  return 'flex flex-wrap justify-center';
}

function getTeacherCardClass(count) {
  if (count <= 1) {
    return 'w-full';
  }

  if (count === 2) {
    return 'w-full flex-none md:basis-[calc(50%_-_0.5rem)]';
  }

  if (count === 3) {
    return 'w-full flex-none lg:basis-[calc((100%_-_2rem)/3)]';
  }

  if (count === 4) {
    return 'w-full flex-none md:basis-[calc(50%_-_0.5rem)] xl:basis-[calc((100%_-_3rem)/4)]';
  }

  return 'w-full flex-none md:basis-[calc(50%_-_0.5rem)] lg:basis-[calc((100%_-_2rem)/3)]';
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
  const { t } = useTranslation();
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
        {t('admin.progress.form.name')}
        <input value={form.name} onChange={setField('name')} className={fieldClass} required />
      </label>

      <label className="grid gap-2 text-sm font-black text-slate-700">
        {t('admin.progress.form.email')}
        <input type="email" value={form.email} onChange={setField('email')} className={fieldClass} required />
      </label>

      <label className="grid gap-2 text-sm font-black text-slate-700">
        {t('admin.progress.form.password')}
        <input type="password" value={form.password} onChange={setField('password')} className={fieldClass} required />
      </label>

      <label className="grid gap-2 text-sm font-black text-slate-700">
        {t('admin.progress.form.role')}
        <select value={form.role} onChange={setField('role')} className={fieldClass}>
          <option value="teacher">Teacher</option>
          <option value="admin">Admin</option>
          <option value="student">Student</option>
        </select>
      </label>

      {form.role === 'student' ? (
        <label className="grid gap-2 text-sm font-black text-slate-700">
          {t('admin.progress.form.level')}
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
          {t('admin.progress.form.cancel')}
        </button>
        <button type="submit" disabled={saving} className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white shadow-button">
          {saving ? t('admin.progress.form.creating') : t('admin.progress.form.createUser')}
        </button>
      </div>
    </form>
  );
}

function TeacherForm({ initialValue, onCancel, onSubmit, saving }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    ...initialValue,
    levels: getTeacherLevels(initialValue),
  });

  const setField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const toggleLevel = (level) => {
    setForm((current) => {
      const currentLevels = Array.isArray(current.levels) ? current.levels : [];
      const levels = currentLevels.includes(level)
        ? currentLevels.filter((item) => item !== level)
        : [...currentLevels, level];

      return { ...current, levels };
    });
  };

  return (
    <form className="mt-5 grid gap-4" onSubmit={(event) => {
      event.preventDefault();
      onSubmit(form);
    }}>
      <label className="grid gap-2 text-sm font-black text-slate-700">
        {t('admin.progress.form.teacherName')}
        <input value={form.name} onChange={setField('name')} className={fieldClass} required />
      </label>

      <label className="grid gap-2 text-sm font-black text-slate-700">
        {t('admin.progress.form.email')}
        <input type="email" value={form.email || ''} onChange={setField('email')} className={fieldClass} required />
      </label>

      <div className="grid gap-2 text-sm font-black text-slate-700">
        {t('admin.progress.form.levels')}
        <div className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
          {adminLevels.map((level) => {
            const checked = (form.levels || []).includes(level);

            return (
              <label
                key={level}
                className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-black transition ${
                  checked
                    ? 'bg-violet-600 text-white'
                    : 'bg-white text-slate-700 hover:bg-violet-50'
                }`}
              >
                <span>{level}</span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleLevel(level)}
                  className="h-4 w-4"
                />
              </label>
            );
          })}
        </div>
      </div>

      <label className="grid gap-2 text-sm font-black text-slate-700">
        {t('admin.progress.form.newPassword')}
        <input type="password" value={form.password || ''} onChange={setField('password')} className={fieldClass} placeholder={t('admin.progress.form.leaveEmptyPlaceholder')} />
      </label>

      <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700">
          {t('admin.progress.form.cancel')}
        </button>
        <button type="submit" disabled={saving} className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white shadow-button">
          {saving ? t('admin.progress.form.saving') : t('admin.progress.form.saveChanges')}
        </button>
      </div>
    </form>
  );
}

function AssignmentForm({ allStudents, assignedIds, onCancel, onSubmit, saving, teacher }) {
  const { t } = useTranslation();
  const teacherLevels = getTeacherLevels(teacher);
  const allowedLevels = teacherLevels;
  const allowedStudentIds = allStudents
    .filter((student) => allowedLevels.includes(student.level))
    .map((student) => student.id);
  const [selectedIds, setSelectedIds] = useState(
    assignedIds.filter((studentId) => allowedStudentIds.includes(studentId)),
  );
  const [activeLevel, setActiveLevel] = useState(allowedLevels[0] || '');
  const visibleStudents = allStudents.filter((student) => student.level === activeLevel);

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
      <div className="flex flex-wrap gap-2">
        {allowedLevels.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setActiveLevel(level)}
            className={`rounded-full px-4 py-2 text-xs font-black transition ${
              activeLevel === level
                ? 'bg-violet-600 text-white'
                : 'bg-violet-50 text-violet-700 hover:bg-violet-100'
            }`}
          >
            {level}
          </button>
        ))}
      </div>

      <div className="grid max-h-80 gap-2 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50 p-3">
        {visibleStudents.length === 0 ? (
          <p className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-500">
            {t('admin.progress.assign.noStudentsInLevel')}
          </p>
        ) : visibleStudents.map((student) => {
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
        {t('admin.progress.assign.assignmentUpdatePrefix')}{teacher.name}.
      </p>

      <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700">
          {t('admin.progress.form.cancel')}
        </button>
        <button type="submit" disabled={saving} className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white shadow-button">
          {saving ? t('admin.progress.assign.assigning') : t('admin.progress.assign.saveAssignment')}
        </button>
      </div>
    </form>
  );
}

function TeachersManagement() {
  const { t } = useTranslation();
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [modal, setModal] = useState(null);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [saving, setSaving] = useState(false);
  const [usesLocalData, setUsesLocalData] = useState(false);
  const [error, setError] = useState('');
  const [expandedLevel, setExpandedLevel] = useState('');
  const [teacherQuery, setTeacherQuery] = useState('');
  const [studentQuery, setStudentQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');

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

  const filteredTeachers = useMemo(() => {
    const normalizedTeacherQuery = teacherQuery.trim().toLowerCase();
    const normalizedStudentQuery = studentQuery.trim().toLowerCase();

    return teachers.filter((teacher) => {
      const teacherLevels = getTeacherLevels(teacher);
      const assignedStudents = studentsByTeacher[teacher.id] || [];
      const matchesTeacher =
        !normalizedTeacherQuery ||
        teacher.name?.toLowerCase().includes(normalizedTeacherQuery);
      const matchesLevel =
        levelFilter === 'all' || teacherLevels.includes(levelFilter);
      const matchesStudent =
        !normalizedStudentQuery ||
        assignedStudents.some((student) =>
          student.name?.toLowerCase().includes(normalizedStudentQuery),
        );

      return matchesTeacher && matchesLevel && matchesStudent;
    });
  }, [levelFilter, studentQuery, studentsByTeacher, teacherQuery, teachers]);

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
              ? {
                  ...teacher,
                  ...form,
                  levelFocus: Array.isArray(form.levels)
                    ? form.levels.join(', ')
                    : teacher.levelFocus,
                  password: '',
                }
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

  const activeStudentSearch = studentQuery.trim().toLowerCase();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#FCF8FF_0%,#F7F0FF_45%,#FFF6FB_100%)] px-3 py-3 text-slate-900 md:px-6 md:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-7xl" dir="rtl">
        <AdminPageHeader icon={GraduationCap} label={t('admin.progress.header')} />

<section
          className="relative mt-8 overflow-hidden rounded-[24px] border border-violet-100/70 bg-white/75 shadow-[0_16px_42px_rgba(109,40,217,0.1)] md:mt-10 md:rounded-[28px]"
          style={{ maxHeight: '140px' }}
        >
          <div className="flex h-full min-h-[140px] items-stretch" dir="ltr">
            <div className="relative w-[34%] shrink-0 overflow-hidden" aria-hidden="true">
              <AdminHeroVisual type="teachers" />
            </div>
            <div className="flex flex-1 flex-col justify-center text-right" style={{ paddingLeft: '4px', paddingRight: '20px' }} dir="rtl">
              <p className="inline-flex w-full items-center justify-start gap-2 text-xs font-black text-violet-700 mb-1 text-right">
                <GraduationCap className="h-4 w-4" />
                {t('admin.progress.heroBadge')}
              </p>
              <h1 className="text-2xl font-black leading-tight text-slate-950 md:text-3xl">{t('admin.progress.heroTitle')}</h1>
              <p className="mt-1 text-sm font-semibold text-slate-600">{t('admin.progress.heroSubtitle')}</p>
              <button type="button" onClick={() => setModal('create-user')} className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-black text-white shadow-sm transition hover:bg-violet-700"><UserPlus className="h-3.5 w-3.5" />{t('admin.progress.heroAddUser')}</button>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[2rem] border border-[#EEE5FF] bg-white/75 p-4 shadow-card backdrop-blur-[8px] sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_0.7fr_1fr]">
            <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50/60 px-4 transition focus-within:border-violet-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-violet-100">
              <Search className="h-5 w-5 shrink-0 text-violet-500" aria-hidden="true" />
              <input
                value={teacherQuery}
                onChange={(event) => setTeacherQuery(event.target.value)}
                placeholder={t('admin.progress.searchTeacherPlaceholder')}
                className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400"
              />
            </label>

            <label className="grid gap-1 text-xs font-black text-violet-700">
              {t('admin.progress.levelFilter')}
              <select
                value={levelFilter}
                onChange={(event) => setLevelFilter(event.target.value)}
                className="min-h-12 rounded-2xl border border-violet-100 bg-violet-50/60 px-4 text-sm font-black text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
              >
                <option value="all">{t('admin.progress.allLevels')}</option>
                {adminLevels.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50/60 px-4 transition focus-within:border-violet-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-violet-100">
              <Search className="h-5 w-5 shrink-0 text-violet-500" aria-hidden="true" />
              <input
                value={studentQuery}
                onChange={(event) => setStudentQuery(event.target.value)}
                placeholder={t('admin.progress.searchStudentPlaceholder')}
                className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400"
              />
            </label>
          </div>

          <p className="mt-3 text-xs font-black text-violet-700">
            {t('admin.progress.showingPrefix')}{filteredTeachers.length}{t('admin.progress.showingMiddle')}{teachers.length}{t('admin.progress.showingSuffix')}
          </p>
        </section>

        <section className={`mt-5 gap-4 ${getTeachersLayoutClass()}`}>
          {filteredTeachers.length === 0 ? (
            <div className="w-full rounded-[1.75rem] border border-violet-100 bg-white/85 p-8 text-center text-sm font-black text-slate-500 shadow-card">
              {t('admin.progress.noTeachersFound')}
            </div>
          ) : filteredTeachers.map((teacher) => {
            const assignedStudents = studentsByTeacher[teacher.id] || [];
            const teacherLevels = getTeacherLevels(teacher);
            const visibleLevels = teacherLevels;

            return (
              <article
                key={teacher.id}
                className={`rounded-[1.75rem] border border-[#EEE5FF] bg-white p-5 shadow-card ${getTeacherCardClass(filteredTeachers.length)}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                    <GraduationCap className="h-6 w-6" />
                  </span>

                  <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">
                    {assignedStudents.length}{t('admin.progress.studentsCountSuffix')}
                  </span>
                </div>

                <h2 className="mt-5 text-lg font-black text-slate-950">
                  {teacher.name}
                </h2>

                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  {teacher.email}
                </p>

                <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs font-black text-slate-400">
                    {t('admin.progress.studyLevels')}
                  </p>

                  <div className="mt-2 grid gap-2">
                    {visibleLevels.length === 0 ? (
                      <p className="text-sm font-semibold text-slate-500">
                        {t('admin.progress.noLevelsDefined')}
                      </p>
                    ) : visibleLevels.map((level) => {
                      const levelKey = `${teacher.id}:${level}`;
                      const studentsForLevel = assignedStudents.filter(
                        (student) => student.level === level,
                      );
                      const levelHasStudentSearchMatch =
                        activeStudentSearch &&
                        studentsForLevel.some((student) =>
                          student.name?.toLowerCase().includes(activeStudentSearch),
                        );
                      const open = expandedLevel === levelKey || levelHasStudentSearchMatch;

                      return (
                        <div key={level} className="rounded-2xl bg-white px-3 py-2">
                          <button
                            type="button"
                            onClick={() => setExpandedLevel(open && !levelHasStudentSearchMatch ? '' : levelKey)}
                            className="flex w-full items-center justify-between gap-3 text-sm font-black text-violet-700"
                          >
                            <span>{level}</span>
                            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px]">
                              {studentsForLevel.length}
                            </span>
                          </button>

                          {open ? (
                            <ul className="mt-2 grid gap-1 text-sm font-semibold text-slate-600">
                              {studentsForLevel.length > 0 ? (
                                studentsForLevel.map((student) => {
                                  const isMatchedStudent =
                                    activeStudentSearch &&
                                    student.name?.toLowerCase().includes(activeStudentSearch);

                                  return (
                                    <li
                                      key={student.id}
                                      className={`rounded-xl px-2 py-1 transition ${
                                        isMatchedStudent
                                          ? 'bg-violet-100 text-violet-900 shadow-[0_6px_16px_rgba(109,40,217,0.10)]'
                                          : ''
                                      }`}
                                    >
                                      - {student.name}
                                    </li>
                                  );
                                })
                              ) : (
                                <li>{t('admin.progress.noStudentsInLevel')}</li>
                              )}
                            </ul>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button type="button" onClick={() => {
                    setSelectedTeacher(teacher);
                    setModal('edit');
                  }} className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-100">
                    <Pencil className="h-4 w-4" />
                    {t('admin.progress.editBtn')}
                  </button>

                  <button type="button" onClick={() => {
                    setSelectedTeacher(teacher);
                    setModal('assign');
                  }} className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-100">
                    <Link2 className="h-4 w-4" />
                    {t('admin.progress.assignBtn')}
                  </button>

                  <button type="button" onClick={() => {
                    setSelectedTeacher(teacher);
                    setModal('delete');
                  }} className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100">
                    <Trash2 className="h-4 w-4" />
                    {t('admin.progress.deleteBtn')}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      </div>

      {modal === 'create-user' ? (
        <Modal title={t('admin.progress.modal.createUserTitle')} description={t('admin.progress.modal.createUserDesc')} onClose={closeModal}>
          <CreateUserForm onCancel={closeModal} onSubmit={submitCreateUser} saving={saving} />
        </Modal>
      ) : null}

      {modal === 'edit' && selectedTeacher ? (
        <Modal title={t('admin.progress.modal.editUserTitle')} description={t('admin.progress.modal.editUserDesc')} onClose={closeModal}>
          <TeacherForm initialValue={{ ...selectedTeacher, password: '' }} onCancel={closeModal} onSubmit={submitTeacherEdit} saving={saving} />
        </Modal>
      ) : null}

      {modal === 'assign' && selectedTeacher ? (
        <Modal title={t('admin.progress.modal.assignTitle')} description={t('admin.progress.modal.assignDesc')} onClose={closeModal}>
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
        <Modal title={t('admin.progress.modal.deleteUserTitle')} onClose={closeModal}>
          <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold leading-7 text-red-700">
            {t('admin.progress.modal.deleteConfirmPrefix')}{selectedTeacher.name}?
          </div>

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={closeModal} className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700">
              {t('admin.progress.form.cancel')}
            </button>

            <button type="button" onClick={confirmDelete} disabled={saving} className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white">
              {saving ? t('admin.progress.form.deleting') : t('admin.progress.deleteBtn')}
            </button>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

export default TeachersManagement;
