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
