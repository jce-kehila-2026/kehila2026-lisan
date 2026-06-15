import React, { useState } from 'react';
import { Star, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const reviewText = {
  ar: {
    teacherTitle: 'تقييم المعلمة للمحادثة',
    studentTitle: 'كيف كانت المحادثة؟',
    teacherSubtitle: 'قيّمي المحادثة وأضيفي ملاحظة للطالبة',
    studentSubtitle: 'تقييمك يساعدنا على التحسين',
    close: 'إغلاق',
    stars: (count) => `${count} نجوم`,
    placeholder: 'ملاحظة اختيارية...',
    skip: 'تخطي',
    sending: 'جارٍ الإرسال...',
    submit: 'إرسال التقييم',
  },
  he: {
    teacherTitle: 'משוב המורה על השיחה',
    studentTitle: 'איך הייתה השיחה?',
    teacherSubtitle: 'דרגו את השיחה והוסיפו הערה לתלמיד',
    studentSubtitle: 'הדירוג שלכם עוזר לנו להשתפר',
    close: 'סגור',
    stars: (count) => `${count} כוכבים`,
    placeholder: 'הערה אופציונלית...',
    skip: 'דלג',
    sending: 'שולח...',
    submit: 'שליחת משוב',
  },
};

function ChatReview({ open, role = 'student', onClose, onSubmit }) {
  const { i18n } = useTranslation();
  const language = i18n.language === 'he' ? 'he' : 'ar';
  const text = reviewText[language];
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const title = role === 'teacher' ? text.teacherTitle : text.studentTitle;
  const subtitle = role === 'teacher' ? text.teacherSubtitle : text.studentSubtitle;

  const handleSubmit = async () => {
    if (rating < 1 || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ rating, comment });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6" role="dialog" aria-modal="true" onClick={onClose} dir="rtl">
      <div className="w-full max-w-md rounded-[28px] border border-white/80 bg-white p-6 shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-950">{title}</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200" aria-label={text.close}>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-6 flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} className="transition hover:-translate-y-0.5 focus:outline-none" aria-label={text.stars(n)}>
              <Star className="h-9 w-9" fill={(hover || rating) >= n ? '#f59e0b' : 'none'} stroke={(hover || rating) >= n ? '#f59e0b' : '#cbd5e1'} aria-hidden="true" />
            </button>
          ))}
        </div>

        <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={text.placeholder} dir="rtl" rows={3} className="mt-5 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-right text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:bg-white" />

        <div className="mt-5 flex items-center justify-between gap-3">
          <button type="button" onClick={onClose} className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50">{text.skip}</button>
          <button type="button" onClick={handleSubmit} disabled={rating < 1 || submitting} className="rounded-full bg-violet-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-40">
            {submitting ? text.sending : text.submit}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatReview;
