import {
  BookOpen,
  Briefcase,
  Bus,
  CalendarDays,
  GraduationCap,
  Hand,
  Hash,
  Home,
  Landmark,
  Leaf,
  Music,
  Plane,
  ShoppingBag,
  SpellCheck,
  Stethoscope,
  Sun,
  Users,
  Utensils,
} from 'lucide-react';



// Shared visual metadata for the word-game categories, used by both the
// Games page (VocabGame) and the Home page category picker so the two stay
// in sync.
export const CATEGORY_META = {
  introductions: { he: 'היכרות', ar: 'تعارف', icon: Hand, color: 'violet' },
  home: { he: 'בית', ar: 'المنزل', icon: Home, color: 'amber' },
  numbers_basics: { he: 'מספרים', ar: 'الأرقام', icon: Hash, color: 'sky' },
  grammar: { he: 'דקדוק', ar: 'قواعد', icon: SpellCheck, color: 'slate' },
  civic_rights: { he: 'זכויות אזרח', ar: 'حقوق مدنية', icon: Landmark, color: 'emerald' },
  transport: { he: 'תחבורה', ar: 'مواصلات', icon: Bus, color: 'cyan' },
  travel: { he: 'טיולים', ar: 'السفر', icon: Plane, color: 'sky' },
  family: { he: 'משפחה', ar: 'العائلة', icon: Users, color: 'rose' },
  work_jobs: { he: 'עבודה', ar: 'العمل', icon: Briefcase, color: 'slate' },
  culture_music: { he: 'תרבות ומוזיקה', ar: 'الثقافة والموسيقى', icon: Music, color: 'fuchsia' },
  health: { he: 'בריאות', ar: 'الصحة', icon: Stethoscope, color: 'emerald' },
  daily_life: { he: 'חיי היום יום', ar: 'الحياة اليومية', icon: Sun, color: 'amber' },
  past_events: { he: 'אירועים', ar: 'المناسبات', icon: CalendarDays, color: 'violet' },
  shopping_leisure: { he: 'קניות ופנאי', ar: 'التسوق والترفيه', icon: ShoppingBag, color: 'pink' },
  animals_nature: { he: 'טבע', ar: 'الطبيعة', icon: Leaf, color: 'green' },
  school: { he: 'בית ספר', ar: 'المدرسة', icon: GraduationCap, color: 'cyan' },
  food_restaurant: { he: 'אוכל ומסעדות', ar: 'الطعام والمطاعم', icon: Utensils, color: 'orange' },
};

export const COLOR_MAP = {
  indigo: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-100',
    hoverBg: 'group-hover:bg-indigo-600',
    bar: 'bg-indigo-500',
  },
  sky: {
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-100',
    hoverBg: 'group-hover:bg-sky-600',
    bar: 'bg-sky-500',
  },
  rose: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-100',
    hoverBg: 'group-hover:bg-rose-600',
    bar: 'bg-rose-500',
  },
  slate: {
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200',
    hoverBg: 'group-hover:bg-slate-700',
    bar: 'bg-slate-500',
  },
  fuchsia: {
    bg: 'bg-fuchsia-50',
    text: 'text-fuchsia-700',
    border: 'border-fuchsia-100',
    hoverBg: 'group-hover:bg-fuchsia-600',
    bar: 'bg-fuchsia-500',
  },
  emerald: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-100',
    hoverBg: 'group-hover:bg-emerald-600',
    bar: 'bg-emerald-500',
  },
  amber: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-100',
    hoverBg: 'group-hover:bg-amber-600',
    bar: 'bg-amber-500',
  },
  violet: {
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    border: 'border-violet-100',
    hoverBg: 'group-hover:bg-violet-600',
    bar: 'bg-violet-500',
  },
  pink: {
    bg: 'bg-pink-50',
    text: 'text-pink-700',
    border: 'border-pink-100',
    hoverBg: 'group-hover:bg-pink-600',
    bar: 'bg-pink-500',
  },
  green: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-100',
    hoverBg: 'group-hover:bg-green-600',
    bar: 'bg-green-500',
  },
  cyan: {
    bg: 'bg-cyan-50',
    text: 'text-cyan-700',
    border: 'border-cyan-100',
    hoverBg: 'group-hover:bg-cyan-600',
    bar: 'bg-cyan-500',
  },
  orange: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-100',
    hoverBg: 'group-hover:bg-orange-600',
    bar: 'bg-orange-500',
  },
};

export function getCategoryMeta(key) {
  return (
    CATEGORY_META[key] || {
      he: key,
      ar: key,
      icon: BookOpen,
      color: 'violet',
    }
  );
}
