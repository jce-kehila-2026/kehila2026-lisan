export const levelAnalytics = [
  {
    level: 'A1',
    students: 18,
    teachers: 4,
    entries: 142,
    stories: 86,
    chat: 118,
  },
  {
    level: 'A2',
    students: 14,
    teachers: 3,
    entries: 128,
    stories: 74,
    chat: 96,
  },
  {
    level: 'B1',
    students: 9,
    teachers: 2,
    entries: 84,
    stories: 41,
    chat: 68,
  },
  {
    level: 'B2',
    students: 6,
    teachers: 2,
    entries: 55,
    stories: 29,
    chat: 42,
  },
];

export const weeklyActivity = [
  { day: 'א', value: 42 },
  { day: 'ב', value: 58 },
  { day: 'ג', value: 49 },
  { day: 'ד', value: 67 },
  { day: 'ה', value: 73 },
  { day: 'ו', value: 38 },
  { day: 'ש', value: 31 },
];

export const featureUsage = [
  { name: 'תרגול שיחות', value: 324, color: 'bg-violet-500' },
  { name: 'קריאת סיפורים', value: 230, color: 'bg-fuchsia-400' },
  { name: 'תרגול מילים', value: 188, color: 'bg-indigo-400' },
  { name: 'משחקי למידה', value: 146, color: 'bg-rose-300' },
];

export function getTopLevel(metric) {
  return levelAnalytics.reduce((topLevel, level) =>
    level[metric] > topLevel[metric] ? level : topLevel,
  levelAnalytics[0]);
}
