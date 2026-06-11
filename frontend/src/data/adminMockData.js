export const adminLevels = ['א1', 'א2', 'ב1', 'ב2', 'ג'];

export const adminStudentsSeed = [
  {
    id: 'student_001',
    name: 'ליאן',
    email: 'layan@student.demo',
    level: 'א1',
    teacherId: 'teacher_001',
    status: 'active',
  },
  {
    id: 'student_002',
    name: 'סמאח',
    email: 'samah@student.demo',
    level: 'א2',
    teacherId: 'teacher_001',
    status: 'active',
  },
  {
    id: 'student_003',
    name: 'רנין',
    email: 'ranin@student.demo',
    level: 'ב1',
    teacherId: 'teacher_002',
    status: 'active',
  },
  {
    id: 'student_004',
    name: 'היבא',
    email: 'hiba@student.demo',
    level: 'ב2',
    teacherId: 'teacher_003',
    status: 'active',
  },
  {
    id: 'student_005',
    name: 'אמאל',
    email: 'amal@student.demo',
    level: 'ג',
    teacherId: 'teacher_002',
    status: 'suspended',
  },
];

export const adminTeachersSeed = [
  {
    id: 'teacher_001',
    name: 'נועה כהן',
    email: 'noa.teacher@lisan.demo',
    levelFocus: 'א1, א2',
    className: 'כיתת מתחילות',
  },
  {
    id: 'teacher_002',
    name: 'מרים אבו חסן',
    email: 'mariam.teacher@lisan.demo',
    levelFocus: 'ב1, ב2',
    className: 'כיתת שיחה',
  },
  {
    id: 'teacher_003',
    name: 'תמר לוי',
    email: 'tamar.teacher@lisan.demo',
    levelFocus: 'ג',
    className: 'כיתת מתקדמות',
  },
];

export const adminReviewNotifications = [
  {
    id: 'review_word_001',
    type: 'word',
    title: 'מילה חדשה ממתינה לבדיקה',
    text: 'המילה "תור" נוספה מתרגול תלמידה וממתינה לסקירה.',
    time: 'לפני 12 דקות',
  },
  {
    id: 'review_conversation_001',
    type: 'conversation',
    title: 'שיחה חדשה ממתינה לבדיקה',
    text: 'שיחת תרגול בנושא קופת חולים ממתינה לבדיקה.',
    time: 'לפני שעה',
  },
  {
    id: 'review_word_002',
    type: 'word',
    title: 'מילה חדשה ממתינה לבדיקה',
    text: 'המילה "מרשם" נוספה לרשימת התרגול.',
    time: 'היום, 10:20',
  },
];

export const adminDemoUsers = [
  ...adminStudentsSeed.map((student) => ({
    ...student,
    role: 'student',
    teacherIds: student.teacherIds || (student.teacherId ? [student.teacherId] : []),
    language: 'ar',
    lastLoginAt: '2026-06-10T12:30:00.000Z',
    createdAt: '2026-03-01T09:00:00.000Z',
  })),
  ...adminTeachersSeed.map((teacher, index) => ({
    ...teacher,
    role: index === 2 ? 'admin' : 'teacher',
    language: index === 1 ? 'ar' : 'he',
    status: 'active',
    lastLoginAt: '2026-06-10T08:45:00.000Z',
    createdAt: '2026-02-10T09:00:00.000Z',
  })),
  {
    id: 'admin_001',
    name: 'מנהלת ליסאן',
    email: 'admin@lisan.local',
    role: 'admin',
    language: 'he',
    status: 'active',
    lastLoginAt: '2026-06-11T07:20:00.000Z',
    createdAt: '2026-01-15T09:00:00.000Z',
  },
];

export const adminDemoNotifications = [
  {
    id: 'notification_001',
    title: 'מילים חדשות לבדיקה',
    message: '4 מילים חדשות ממתינות לסיווג רמה ואישור.',
    preview: 'התנסות, להקשיב, להתקדם, בחירה',
    createdAt: '2026-06-11T08:15:00.000Z',
    isRead: false,
    relatedChatId: '',
  },
  {
    id: 'notification_002',
    title: 'שיחת AI דורשת סקירה',
    message: 'שיחה ברמת B1 מצריכה מבט מנהלת לפני אישור.',
    preview: 'תרגול ראיון עבודה קצר עם הערות דקדוק.',
    createdAt: '2026-06-10T14:15:00.000Z',
    isRead: false,
    relatedChatId: '',
  },
  {
    id: 'notification_003',
    title: 'עדכון שיוך תלמידות',
    message: 'תלמידה חדשה שויכה לכיתת מתחילות.',
    preview: 'נועה כהן קיבלה תלמידה חדשה ברמת A1.',
    createdAt: '2026-06-09T10:40:00.000Z',
    isRead: true,
    relatedChatId: '',
  },
];
