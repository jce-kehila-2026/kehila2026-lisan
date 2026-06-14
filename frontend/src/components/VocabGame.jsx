import React, { useMemo, useState, useEffect } from 'react';
import { ArrowRight, ArrowLeft, RotateCw, Volume2, Check, X, Trophy } from 'lucide-react';
import { getStoredToken } from '../services/auth.js';
import gameData from '../data/gameWords.json';

const API_BASE_URL = 'http://localhost:3000/api';
const PASS_THRESHOLD = 6;

const CATEGORY_META = {
    travel: { he: 'טיולים', ar: 'سفر', emoji: '✈️' },
    family: { he: 'משפחה', ar: 'عائلة', emoji: '👨‍👩‍👧' },
    work_jobs: { he: 'עבודה', ar: 'عمل', emoji: '💼' },
    culture_music: { he: 'תרבות ומוזיקה', ar: 'ثقافة وموسيقى', emoji: '🎵' },
    health: { he: 'בריאות', ar: 'صحة', emoji: '🩺' },
    daily_life: { he: 'חיי היומיום', ar: 'الحياة اليومية', emoji: '☀️' },
    past_events: { he: 'אירועים', ar: 'مناسبات', emoji: '📅' },
    shopping_leisure: { he: 'קניות ופנאי', ar: 'تسوق وترفيه', emoji: '🛍️' },
    animals_nature: { he: 'חيות וטבע', ar: 'حيوانات وطبيعة', emoji: '🌿' },
    school: { he: 'בית ספר', ar: 'مدرسة', emoji: '🏫' },
    food_restaurant: { he: 'אוכל ומסעדות', ar: 'طعام ومطاعم', emoji: '🍽️' },
};

function pronounce(text) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'he-IL';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function VocabGame() {
    // view: 'categories' | 'levels' | 'cards' | 'quiz'
    const [gameProgress, setGameProgress] = useState({}); // { category: [levelIdx,...] }
    const [view, setView] = useState('categories');
    const [activeCategory, setActiveCategory] = useState(null);
    const [activeLevel, setActiveLevel] = useState(null);
    const [cardIndex, setCardIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);

    // quiz state
    const [questions, setQuestions] = useState([]);
    const [qIndex, setQIndex] = useState(0);
    const [selected, setSelected] = useState(null);
    const [score, setScore] = useState(0);
    const [savedThisQuiz, setSavedThisQuiz] = useState(false);

    const categories = useMemo(() => {
        return Object.entries(gameData)
            .map(([key, value]) => ({
                key,
                totalWords: value.total_words,
                numLevels: value.num_levels,
                meta: CATEGORY_META[key] || { he: key, ar: '', emoji: '📚' },
            }))
            .sort((a, b) => b.totalWords - a.totalWords);
    }, []);

    useEffect(() => {
        const token = getStoredToken();
        if (!token) return;
        fetch(`${API_BASE_URL}/progress/game`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => { if (data?.categories) setGameProgress(data.categories); })
            .catch(() => {});
    }, []);

    useEffect(() => {
        const isQuizDone = view === 'quiz' && qIndex >= questions.length && questions.length > 0;
        if (!savedThisQuiz && isQuizDone && score >= PASS_THRESHOLD && activeCategory != null && activeLevel != null) {
            const token = getStoredToken();
            if (!token) return;
            setSavedThisQuiz(true);
            fetch(`${API_BASE_URL}/progress/game/complete`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: activeCategory, levelIndex: activeLevel }),
            })
                .then((r) => (r.ok ? r.json() : null))
                .then((data) => { if (data?.categories) setGameProgress(data.categories); })
                .catch(() => {});
        }
    });

    const activeMeta = activeCategory ? CATEGORY_META[activeCategory] : null;
    const activeLevels = activeCategory ? gameData[activeCategory].levels : [];
    const levelWords = (activeCategory != null && activeLevel != null)
        ? gameData[activeCategory].levels[activeLevel]
        : [];
    const currentCard = levelWords[cardIndex];

    const openCategory = (key) => { setActiveCategory(key); setView('levels'); };
    const backToCategories = () => { setView('categories'); setActiveCategory(null); };
    const openLevel = (index) => { setActiveLevel(index); setCardIndex(0); setFlipped(false); setView('cards'); };
    const backToLevels = () => { setView('levels'); setActiveLevel(null); };

    const nextCard = () => { if (cardIndex < levelWords.length - 1) { setCardIndex((i) => i + 1); setFlipped(false); } };
    const prevCard = () => { if (cardIndex > 0) { setCardIndex((i) => i - 1); setFlipped(false); } };
    const isLastCard = cardIndex === levelWords.length - 1;

    // Build the quiz: each level word becomes a Hebrew→Arabic question.
    // Distractors are pulled from the whole category (all levels) so they're
    // thematically similar; fall back across categories if needed.
    const startQuiz = () => {
        const categoryWords = gameData[activeCategory].levels.flat();
        const built = levelWords.map((word) => {
            const pool = categoryWords.filter((w) => w.arabic !== word.arabic);
            const distractors = shuffle(pool).slice(0, 3).map((w) => w.arabic);
            const options = shuffle([word.arabic, ...distractors]);
            return { hebrew: word.hebrew, correct: word.arabic, options };
        });
        setQuestions(built);
        setQIndex(0);
        setSelected(null);
        setScore(0);
        setSavedThisQuiz(false);
        setView('quiz');
    };

    const answer = (option) => {
        if (selected !== null) return; // lock after first tap
        setSelected(option);
        if (option === questions[qIndex].correct) setScore((s) => s + 1);
    };

    const nextQuestion = () => {
        if (qIndex < questions.length - 1) { setQIndex((i) => i + 1); setSelected(null); }
        else { setQIndex(questions.length); } // triggers results screen
    };

    const currentQuestion = questions[qIndex];
    const quizDone = view === 'quiz' && qIndex >= questions.length && questions.length > 0;

    return (
        <section
            className="lisan-enter mt-8 rounded-[28px] border border-white/80 bg-[linear-gradient(135deg,#FFFFFF_0%,#FBF8FF_48%,#F4ECFF_100%)] p-6 shadow-card lg:p-8"
            style={{ '--lisan-enter-delay': '450ms' }}
            dir="rtl"
        >
            {/* ── CATEGORIES ─────────────────────────────── */}
            {view === 'categories' && (
                <>
                    <div className="mb-1 flex items-center justify-between gap-3">
                        <h2 className="text-[clamp(1.75rem,2.1vw,2.75rem)] font-black text-slate-950">משחק המילים</h2>
                        <span className="rounded-full bg-violet-50 px-3 py-1 text-sm font-bold text-violet-700">804 מילים</span>
                    </div>
                    <p className="mt-2 text-[clamp(1rem,1.1vw,1.2rem)] font-medium leading-7 text-slate-600">בחרו קטגוריה כדי להתחיל ללמוד מילים חדשות</p>
                    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {categories.map((category) => (
                            <button key={category.key} type="button" onClick={() => openCategory(category.key)} className="group flex flex-col gap-3 rounded-2xl border border-violet-100/80 bg-white/72 p-4 text-right shadow-[inset_0_0_0_1px_rgba(221,214,254,0.5)] backdrop-blur-sm transition hover:-translate-y-1 hover:border-violet-300 hover:shadow-[0_18px_36px_rgba(124,58,237,0.16)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2">
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-2xl"><span aria-hidden="true">{category.meta.emoji}</span></div>
                                <div>
                                    <div className="text-base font-black text-slate-900">{category.meta.he}</div>
                                    <div className="text-sm font-bold text-slate-400">{category.meta.ar}</div>
                                </div>
                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500"><span>{category.totalWords} מילים</span><span className="opacity-40">·</span><span>{category.numLevels} שלבים</span></div>
                                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-violet-100"><div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${Math.round(((gameProgress[category.key]?.length || 0) / category.numLevels) * 100)}%` }} /></div>
                            </button>
                        ))}
                    </div>
                </>
            )}

            {/* ── LEVELS ─────────────────────────────────── */}
            {view === 'levels' && (
                <>
                    <div className="mb-1 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <span className="text-3xl" aria-hidden="true">{activeMeta?.emoji}</span>
                            <div><h2 className="text-[clamp(1.5rem,1.8vw,2.25rem)] font-black text-slate-950">{activeMeta?.he}</h2><p className="text-sm font-bold text-slate-400">{activeMeta?.ar}</p></div>
                        </div>
                        <button type="button" onClick={backToCategories} className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-bold text-violet-700 shadow-sm transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500"><ArrowRight className="h-4 w-4" aria-hidden="true" />חזרה לקטגוריות</button>
                    </div>
                    <p className="mt-2 text-base font-medium leading-7 text-slate-600">בחרו שלב — כל שלב מכיל עד 10 מילים</p>
                    <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                        {activeLevels.map((words, index) => (
                            <button key={index} type="button" onClick={() => openLevel(index)} className="group flex flex-col items-center justify-center gap-1 rounded-2xl border border-violet-100/80 bg-white/72 p-5 text-center shadow-[inset_0_0_0_1px_rgba(221,214,254,0.5)] backdrop-blur-sm transition hover:-translate-y-1 hover:border-violet-300 hover:shadow-[0_18px_36px_rgba(124,58,237,0.16)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2">
                                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-xl font-black text-violet-700 transition group-hover:bg-violet-600 group-hover:text-white">{index + 1}</span>
                                <span className="mt-1 text-sm font-black text-slate-900">שלב {index + 1}</span>
                                <span className="text-xs font-bold text-slate-400">{words.length} מילים</span>
                            </button>
                        ))}
                    </div>
                </>
            )}

            {/* ── CARDS ──────────────────────────────────── */}
            {view === 'cards' && currentCard && (
                <>
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3"><span className="text-2xl" aria-hidden="true">{activeMeta?.emoji}</span><h2 className="text-xl font-black text-slate-950">{activeMeta?.he} · שלב {activeLevel + 1}</h2></div>
                        <button type="button" onClick={backToLevels} className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-bold text-violet-700 shadow-sm transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500"><ArrowRight className="h-4 w-4" aria-hidden="true" />חזרה לשלבים</button>
                    </div>
                    <div className="mb-4 flex items-center gap-3">
                        <span dir="ltr" className="text-sm font-bold text-slate-500">{cardIndex + 1} / {levelWords.length}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-violet-100"><div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${((cardIndex + 1) / levelWords.length) * 100}%` }} /></div>
                    </div>
                    <button type="button" onClick={() => setFlipped((f) => !f)} className="relative mx-auto flex min-h-[240px] w-full max-w-md flex-col items-center justify-center gap-3 rounded-[24px] border-2 border-violet-200 bg-white p-8 text-center shadow-[0_18px_40px_rgba(124,58,237,0.12)] transition hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-violet-500">
                        {!flipped ? (
                            <><span className="text-4xl font-black text-slate-900">{currentCard.hebrew}</span><span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-600"><RotateCw className="h-3.5 w-3.5" aria-hidden="true" />הקישו כדי לראות תרגום</span></>
                        ) : (
                            <><span className="text-4xl font-black text-violet-700">{currentCard.arabic}</span>{currentCard.transliteration ? <span className="text-base font-bold text-slate-400">{currentCard.transliteration}</span> : null}<span className="mt-1 text-sm font-bold text-slate-500">{currentCard.hebrew}</span></>
                        )}
                    </button>
                    <div className="mt-3 flex justify-center">
                        <button type="button" onClick={() => pronounce(currentCard.hebrew)} className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 transition hover:bg-violet-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"><Volume2 className="h-4 w-4" aria-hidden="true" />השמע</button>
                    </div>
                    <div className="mt-5 flex items-center justify-between gap-3">
                        <button type="button" onClick={prevCard} disabled={cardIndex === 0} className="inline-flex items-center gap-1 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-violet-500"><ArrowRight className="h-4 w-4" aria-hidden="true" />הקודם</button>
                        {!isLastCard ? (
                            <button type="button" onClick={nextCard} className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500">הבא<ArrowLeft className="h-4 w-4" aria-hidden="true" /></button>
                        ) : (
                            <button type="button" onClick={startQuiz} className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500">סיימתי — למבחן</button>
                        )}
                    </div>
                </>
            )}

            {/* ── QUIZ ───────────────────────────────────── */}
            {view === 'quiz' && !quizDone && currentQuestion && (
                <>
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3"><span className="text-2xl" aria-hidden="true">{activeMeta?.emoji}</span><h2 className="text-xl font-black text-slate-950">מבחן · {activeMeta?.he}</h2></div>
                        <button type="button" onClick={() => setView('cards')} className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-bold text-violet-700 shadow-sm transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500"><ArrowRight className="h-4 w-4" aria-hidden="true" />חזרה לכרטיסים</button>
                    </div>
                    <div className="mb-5 flex items-center gap-3">
                        <span dir="ltr" className="text-sm font-bold text-slate-500">{qIndex + 1} / {questions.length}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-violet-100"><div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${((qIndex + 1) / questions.length) * 100}%` }} /></div>
                    </div>
                    <div className="mx-auto max-w-md text-center">
                        <p className="text-sm font-bold text-slate-500">מה התרגום של</p>
                        <p className="mt-1 text-4xl font-black text-slate-900">{currentQuestion.hebrew}</p>
                    </div>
                    <div className="mx-auto mt-6 grid max-w-md gap-3">
                        {currentQuestion.options.map((option) => {
                            const isCorrect = option === currentQuestion.correct;
                            const isPicked = option === selected;
                            let style = 'border-violet-100 bg-white text-slate-800 hover:border-violet-300 hover:bg-violet-50';
                            if (selected !== null) {
                                if (isCorrect) style = 'border-emerald-400 bg-emerald-50 text-emerald-800';
                                else if (isPicked) style = 'border-red-300 bg-red-50 text-red-700';
                                else style = 'border-slate-100 bg-white text-slate-400';
                            }
                            return (
                                <button key={option} type="button" onClick={() => answer(option)} disabled={selected !== null} className={`flex items-center justify-between gap-2 rounded-2xl border-2 px-5 py-4 text-right text-lg font-bold transition focus:outline-none focus:ring-2 focus:ring-violet-500 ${style}`}>
                                    <span>{option}</span>
                                    {selected !== null && isCorrect ? <Check className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" /> : null}
                                    {selected !== null && isPicked && !isCorrect ? <X className="h-5 w-5 shrink-0 text-red-500" aria-hidden="true" /> : null}
                                </button>
                            );
                        })}
                    </div>
                    {selected !== null ? (
                        <div className="mx-auto mt-6 flex max-w-md justify-center">
                            <button type="button" onClick={nextQuestion} className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500">
                                {qIndex < questions.length - 1 ? 'השאלה הבאה' : 'סיום'}<ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>
                    ) : null}
                </>
            )}

            {/* ── QUIZ RESULTS ───────────────────────────── */}
            {quizDone && (
                <div className="mx-auto max-w-md py-6 text-center">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-amber-500"><Trophy className="h-10 w-10" aria-hidden="true" /></div>
                    <h2 className="mt-4 text-2xl font-black text-slate-900">סיימתם את השלב!</h2>
                    <p className="mt-2 text-lg font-bold text-slate-600">הציון שלכם: <span dir="ltr" className="text-violet-700">{score} / {questions.length}</span></p>
                    <div className="mt-6 flex flex-wrap justify-center gap-3">
                        <button type="button" onClick={startQuiz} className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500">נסו שוב</button>
                        <button type="button" onClick={backToLevels} className="inline-flex items-center gap-1 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-violet-700 shadow-sm transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500">חזרה לשלבים</button>
                    </div>
                </div>
            )}
        </section>
    );
}

export default VocabGame;