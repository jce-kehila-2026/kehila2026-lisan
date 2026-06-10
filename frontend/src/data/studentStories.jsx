import {
  Briefcase,
  Cat,
  Music,
  Plane,
  School,
  ShoppingBag,
  Stethoscope,
  Sun,
  Utensils,
  Users,
} from 'lucide-react';

export const storyCategories = [
  'family',
  'daily_life',
  'travel',
  'health',
  'school',
  'food_restaurant',
  'shopping_leisure',
  'work_jobs',
  'culture_music',
  'past_events',
  'animals_nature',
];

export const studentStories = [
  {
    id: 'family-visit',
    category: 'family',
    icon: Users,
    title: { he: 'ביקור משפחתי', ar: 'زيارة عائلية' },
    subtitle: { he: 'שיחה עם בני משפחה בבית', ar: 'محادثة مع العائلة في البيت' },
  },
  {
    id: 'morning-routine',
    category: 'daily_life',
    icon: Sun,
    title: { he: 'שגרת בוקר', ar: 'روتين الصباح' },
    subtitle: { he: 'מה עושים בתחילת היום', ar: 'ماذا نفعل في بداية اليوم' },
  },
  {
    id: 'airport-journey',
    category: 'travel',
    icon: Plane,
    title: { he: 'נסיעה לשדה התעופה', ar: 'رحلة إلى المطار' },
    subtitle: { he: 'כרטיסים, מזוודות ושאלות בדרך', ar: 'تذاكر وحقائب وأسئلة في الطريق' },
  },
  {
    id: 'doctor-appointment',
    category: 'health',
    icon: Stethoscope,
    title: { he: 'תור לרופא', ar: 'موعد عند الطبيب' },
    subtitle: { he: 'מסבירים כאב וקובעים המשך טיפול', ar: 'نشرح الألم ونحدد العلاج' },
  },
  {
    id: 'first-day-school',
    category: 'school',
    icon: School,
    title: { he: 'יום ראשון בבית הספר', ar: 'اليوم الأول في المدرسة' },
    subtitle: { he: 'מכירות כיתה, מורה וחברות', ar: 'نتعرف على الصف والمعلمة والصديقات' },
  },
  {
    id: 'at-restaurant',
    category: 'food_restaurant',
    icon: Utensils,
    title: { he: 'במסעדה', ar: 'في المطعم' },
    subtitle: { he: 'מזמינים אוכל ומשלמים', ar: 'نطلب الطعام وندفع' },
  },
  {
    id: 'shopping-day',
    category: 'shopping_leisure',
    icon: ShoppingBag,
    title: { he: 'יום קניות', ar: 'يوم تسوق' },
    subtitle: { he: 'בוחרות מתנה ושואלות מחיר', ar: 'نختار هدية ونسأل عن السعر' },
  },
  {
    id: 'job-interview',
    category: 'work_jobs',
    icon: Briefcase,
    title: { he: 'ראיון עבודה', ar: 'مقابلة عمل' },
    subtitle: { he: 'מציגות ניסיון ושואלות על התפקיד', ar: 'نعرض الخبرة ونسأل عن الوظيفة' },
  },
  {
    id: 'music-festival',
    category: 'culture_music',
    icon: Music,
    title: { he: 'פסטיבל מוזיקה', ar: 'مهرجان موسيقى' },
    subtitle: { he: 'מדברות על הופעות ושירים', ar: 'نتحدث عن العروض والأغاني' },
  },
  {
    id: 'lost-pet',
    category: 'animals_nature',
    icon: Cat,
    title: { he: 'חתול שאבד', ar: 'قطة ضائعة' },
    subtitle: { he: 'מבקשות עזרה ומתארות סימנים', ar: 'نطلب المساعدة ونصف العلامات' },
  },
];

export function getStudentStoryById(id) {
  return studentStories.find((story) => story.id === id);
}

export function getStudentStoryTitle(story, language = 'he') {
  return story?.title?.[language] || story?.title?.he || '';
}

export function getStudentStorySubtitle(story, language = 'he') {
  return story?.subtitle?.[language] || story?.subtitle?.he || '';
}
