/**
 * ChatbotPage.jsx  —  Sprint 4 MVP
 *
 * State architecture
 * ──────────────────
 * All chat state lives here (single source of truth) and flows down as props.
 * Children are pure presentational components.
 *
 *  composerValue      ← controlled textarea value
 *  messages[]         ← optimistic list; each item has a stable `localId`
 *  conversationId     ← null = new chat; set after first AI response
 *  loading            ← true while the POST /api/chat/ request is in-flight
 *
 * Double-send prevention
 * ──────────────────────
 * `loading` is the single guard:
 *   • submitMessage() bails early if `loading === true`
 *   • ChatComposer disables the textarea AND the send button while `loading`
 *   • Enter key handler in ChatComposer also respects `disabled`
 * This means no matter how fast the user clicks or taps, only one request
 * is ever in-flight at a time.
 *
 * Auto-scroll
 * ───────────
 * scrollAnchorRef is a zero-height <div> rendered inside ChatWindow after
 * the last message.  A useEffect fires whenever `messages` or `loading`
 * changes and calls scrollIntoView({ behavior: 'smooth' }).
 *
 * RTL
 * ───
 * Every Hebrew/Arabic text node carries dir="rtl" explicitly.
 * The composer textarea is also dir="rtl" so Hebrew input starts correctly.
 *
 * Error mapping
 * ─────────────
 *  401  → logout + redirect to /login
 *  408  → chatTimeoutError  (FastAPI 6-second timeout surfaced to user)
 *  429  → chatRateLimitError
 *  503  → chatServiceError  (AI service down)
 *  400  → chatValidationError
 *  *    → chatServiceError  (generic fallback)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { BotMessageSquare, Globe, History, Keyboard, Mic, MessageSquarePlus, ShieldCheck, Sparkles, Star, Volume2 } from 'lucide-react';
import BottomNav from '../components/BottomNav.jsx';
import LisanLogo from '../components/LisanLogo.jsx';
import LanguageToggle from '../components/LanguageToggle.jsx';
import ChatComposer from '../components/chat/ChatComposer.jsx';
import VoiceConsole from '../components/chat/VoiceConsole.jsx';
import ConversationSidebar from '../components/chat/ConversationSidebar.jsx';
import ChatWindow from '../components/chat/ChatWindow.jsx';
import ChatReview from '../components/chat/ChatReview.jsx';
import { useAudioRecorder } from '../hooks/useAudioRecorder.js';
import { logout, getStoredToken } from '../services/auth.js';
import {
  DEFAULT_CHAT_LEVEL,
  deleteConversation,
  fetchConversation,
  fetchConversations,
  getChatErrorPresentation,
  sendChatMessage,
  sendVoiceMessage,
  synthesizeSpeech,
} from '../services/chat.js';

// Fallback reasons that mean STT couldn't make out the speech (vs an
// out-of-scope / guardrail fallback where a transcript does exist).
const STT_FALLBACK_REASONS = new Set([
  'STT_EMPTY',
  'STT_FAILED',
  'STT_TIMEOUT',
  'STT_CIRCUIT_OPEN',
]);

function createLocalMessage({
  role,
  textHe,
  textAr        = null,
  pending       = false,
  fallbackUsed  = false,
  fallbackReason = null,
  pronunciationScore = null,
  audioBase64 = null,
}) {
  return {
    localId: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    textHe,
    textAr,
    pending,
    fallbackUsed,
    fallbackReason,
    pronunciationScore,
    audioBase64,
  };
}

function ChatbotPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const recorder = useAudioRecorder();
  const reduceMotion = useReducedMotion();
  // Active interaction mode: 'text' (type), 'voice' (one-shot voice message),
  // 'free' (hands-free spoken conversation). All three reuse the existing
  // send/voice handlers — only the input surface + whether the reply is read
  // aloud differ.
  const [inputMode, setInputMode] = useState('text');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioElementRef = useRef(null);
  // Captured at record-start so submitVoiceMessage knows whether to read the
  // reply aloud (true only for the free-conversation mode).
  const speakReplyRef = useRef(false);
  const [composerValue, setComposerValue] = useState('');
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewedChats, setReviewedChats] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('lisan-reviewed-chats') || '[]'); } catch { return []; }
  });
  // Distinguishes a voice round-trip (STT → chat → TTS) from a text request so
  // the typing indicator can show a voice-aware "we're listening…" label.
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  // Two perceived phases of a voice request: first STT ("listening"), then the
  // chat + pronunciation assessment ("analyzing"). One request, but a timed
  // switch makes the wait feel responsive and explains the latency.
  const [voicePhase, setVoicePhase] = useState('listening');
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [readAloudLoadingId, setReadAloudLoadingId] = useState(null);
  const [readAloudPlayingId, setReadAloudPlayingId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Arabic toggle — persisted in sessionStorage so it survives navigation
  const [includeArabic, setIncludeArabic] = useState(() => {
    try { return sessionStorage.getItem('lisan-include-arabic') === 'true'; }
    catch { return false; }
  });

  const toggleArabic = () => {
    setIncludeArabic((prev) => {
      const next = !prev;
      try { sessionStorage.setItem('lisan-include-arabic', String(next)); } catch {}
      return next;
    });
  };

  const refreshConversations = async () => {
    setConversationsLoading(true);
    try {
      const nextConversations = await fetchConversations();
      setConversations(nextConversations);
    } catch (error) {
      presentError(error);
    } finally {
      setConversationsLoading(false);
    }
  };

  useEffect(() => {
    refreshConversations();
  }, []);

  useEffect(() => {
    if (!recorder.error) return;

    switch (recorder.error.code) {
      case 'MICROPHONE_DENIED':
        setErrorMessage(t('chatVoicePermissionDenied'));
        break;
      case 'MICROPHONE_UNAVAILABLE':
        setErrorMessage(t('chatVoiceUnavailable'));
        break;
      case 'RECORDER_INTERRUPTED':
        setErrorMessage(t('chatVoiceInterrupted'));
        break;
      case 'EMPTY_RECORDING':
        setErrorMessage(t('chatVoiceEmptyRecording'));
        break;
      case 'UNSUPPORTED':
        setErrorMessage(t('chatVoiceUnsupported'));
        break;
      default:
        setErrorMessage(t('chatVoiceGenericError'));
        break;
    }
  }, [recorder.error, t]);

  const presentError = (error) => {
    const presentation = getChatErrorPresentation(error);

    if (presentation.status === 401) {
      logout();
      navigate('/login', { replace: true });
      return;
    }

    if (presentation.translationKey === 'chatRateLimitError' && presentation.retryAfterSeconds) {
      setErrorMessage(
        t('chatRateLimitErrorWithRetry', {
          seconds: presentation.retryAfterSeconds,
        })
      );
      return;
    }

    setErrorMessage(t(presentation.translationKey));
  };

  const resetConversation = () => {
    setMessages([]);
    setConversationId(null);
    setErrorMessage('');
  };

  const endAndReview = () => {
    // ask once per chat: if already reviewed this conversation, just reset
    if (!conversationId || reviewedChats.includes(conversationId)) {
      resetConversation();
      return;
    }
    setReviewOpen(true);
  };

  const submitReview = async ({ rating, comment }) => {
    try {
      const token = getStoredToken ? getStoredToken() : null;
      if (conversationId) {
        await fetch(`http://localhost:3000/api/chats/${conversationId}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ rating, comment, role: 'student' }),
        });
        const next = [...reviewedChats, conversationId];
        setReviewedChats(next);
        try { sessionStorage.setItem('lisan-reviewed-chats', JSON.stringify(next)); } catch {}
      }
    } catch (e) { /* ignore network errors */ }
    finally {
      setReviewOpen(false);
      resetConversation();
    }
  };

  const skipReview = () => {
    if (conversationId) {
      const next = [...reviewedChats, conversationId];
      setReviewedChats(next);
      try { sessionStorage.setItem('lisan-reviewed-chats', JSON.stringify(next)); } catch {}
    }
    setReviewOpen(false);
    resetConversation();
  };

  const openConversation = async (nextConversationId) => {
    if (!nextConversationId || loading) return;
    setErrorMessage('');
    setLoading(true);
    try {
      const payload = await fetchConversation(nextConversationId);
      setConversationId(payload.conversation.id);
      setMessages(
        payload.messages.map((message) =>
          createLocalMessage({
            role: message.role,
            textHe: message.textHe || message.rawText || '',
            textAr: message.textAr,
            fallbackUsed: message.fallbackUsed,
          })
        )
      );
    } catch (error) {
      presentError(error);
    } finally {
      setLoading(false);
    }
  };

  const removeConversation = async (targetConversationId) => {
    try {
      await deleteConversation(targetConversationId);
      setConversations((curr) => curr.filter((c) => c.id !== targetConversationId));
      if (targetConversationId === conversationId) resetConversation();
    } catch (error) {
      presentError(error);
    }
  };

  const playVoiceReply = useCallback((text) => {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) return;

    try {
      // Cancel any ongoing speech before starting a new one
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'he-IL';   // Hebrew
      utterance.rate = 0.9;       // slightly slower — clearer for learners
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);

      const speakWithVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        const hebrewVoice = voices.find(
          (v) => v.lang === 'he-IL' || v.lang === 'he' || v.lang.startsWith('he-')
        );
        if (hebrewVoice) utterance.voice = hebrewVoice;
        utterance.onerror = () => {
          setIsSpeaking(false);
          setErrorMessage(t('chatVoicePlaybackError'));
        };
        setIsSpeaking(true);
        window.speechSynthesis.speak(utterance);
      };

      // Voices list may not be ready on first call — wait for it
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        speakWithVoice();
      } else {
        window.speechSynthesis.onvoiceschanged = () => {
          window.speechSynthesis.onvoiceschanged = null;
          speakWithVoice();
        };
      }
    } catch {
      setIsSpeaking(false);
      setErrorMessage(t('chatVoicePlaybackError'));
    }
  }, [t]);

  const playBrowserSpeech = useCallback((text) => new Promise((resolve, reject) => {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) {
      resolve();
      return;
    }

    try {
      audioElementRef.current?.pause();
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'he-IL';
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        resolve();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        reject(new Error('Speech synthesis failed'));
      };

      const speakWithVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        const hebrewVoice = voices.find(
          (v) => v.lang === 'he-IL' || v.lang === 'he' || v.lang.startsWith('he-')
        );
        if (hebrewVoice) utterance.voice = hebrewVoice;
        setIsSpeaking(true);
        window.speechSynthesis.speak(utterance);
      };

      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        speakWithVoice();
      } else {
        window.speechSynthesis.onvoiceschanged = () => {
          window.speechSynthesis.onvoiceschanged = null;
          speakWithVoice();
        };
      }
    } catch (error) {
      setIsSpeaking(false);
      reject(error);
    }
  }), []);

  const playAudioBase64 = useCallback((audioBase64) => new Promise((resolve, reject) => {
    if (!audioBase64 || typeof window === 'undefined') {
      resolve(false);
      return;
    }

    try {
      window.speechSynthesis?.cancel();
      audioElementRef.current?.pause();

      const audio = new Audio(`data:audio/mpeg;base64,${audioBase64}`);
      audioElementRef.current = audio;
      audio.onended = () => {
        setIsSpeaking(false);
        resolve(true);
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        reject(new Error('Audio playback failed'));
      };
      setIsSpeaking(true);
      audio.play().catch((error) => {
        setIsSpeaking(false);
        reject(error);
      });
    } catch (error) {
      setIsSpeaking(false);
      reject(error);
    }
  }), []);

  const playAssistantReply = useCallback(async ({
    localId = null,
    textHe,
    audioBase64 = null,
    fallbackUsed = false,
    pronunciationScore = null,
  }) => {
    const text = (textHe || '').trim();
    if (!text) return;

    setErrorMessage('');
    if (localId) setReadAloudLoadingId(localId);

    try {
      let nextAudioBase64 = audioBase64;
      if (!nextAudioBase64) {
        const ttsPayload = await synthesizeSpeech({
          text,
          isFallback: fallbackUsed,
          pronunciationScore,
        });
        nextAudioBase64 = ttsPayload.audioBase64;
      }

      if (localId) {
        setReadAloudLoadingId(null);
        setReadAloudPlayingId(localId);
      }

      if (nextAudioBase64) {
        await playAudioBase64(nextAudioBase64);
      } else {
        await playBrowserSpeech(text);
      }
    } catch {
      try {
        await playBrowserSpeech(text);
      } catch {
        setErrorMessage(t('chatVoicePlaybackError'));
      }
    } finally {
      if (localId) {
        setReadAloudLoadingId(null);
        setReadAloudPlayingId(null);
      }
      setIsSpeaking(false);
    }
  }, [playAudioBase64, playBrowserSpeech, t]);

  const submitMessage = async (prefilledMessage) => {
    const message = typeof prefilledMessage === 'string' ? prefilledMessage : composerValue;
    const trimmedMessage = message.trim();
    if (!trimmedMessage || loading) return;

    setErrorMessage('');
    setComposerValue('');

    const optimisticUserMessage = createLocalMessage({ role: 'user', textHe: trimmedMessage });
    setMessages((curr) => [...curr, optimisticUserMessage]);
    setLoading(true);

    try {
      const response = await sendChatMessage({
        message: trimmedMessage,
        conversationId,
        level: DEFAULT_CHAT_LEVEL,
        includeArabic,
      });
      setConversationId(response.conversationId);
      setMessages((curr) => [
        ...curr,
        createLocalMessage({
          role:          'assistant',
          textHe:        response.answerHe,
          textAr:        response.answerAr,
          fallbackUsed:  response.fallbackUsed,
          fallbackReason: response.fallbackReason,
        }),
      ]);
      await refreshConversations();
    } catch (error) {
      presentError(error);
    } finally {
      setLoading(false);
    }
  };

  const submitVoiceMessage = useCallback(async (audioBlob) => {
    if (!audioBlob || loading) return;

    setErrorMessage('');
    setVoiceProcessing(true);
    setVoicePhase('listening');
    setLoading(true);

    // After STT typically completes (~2.5s), shift the label to "analyzing
    // pronunciation" so the remaining wait reads as deliberate, not stuck.
    const phaseTimer = setTimeout(() => setVoicePhase('analyzing'), 2500);

    try {
      const response = await sendVoiceMessage({
        audioBlob,
        conversationId,
        level: DEFAULT_CHAT_LEVEL,
        includeArabic,
      });

      setConversationId(response.conversationId);

      // STT failures surface a clear, encouraging "couldn't hear you" message
      // rather than a generic bubble. No transcript → skip the empty user bubble.
      const transcript = (response.transcribedText || '').trim();
      const sttFailed = response.fallbackUsed && STT_FALLBACK_REASONS.has(response.fallbackReason);
      const assistantText = response.answerHe
        || (sttFailed ? t('chatVoiceNotHeard') : t('chatVoiceTranscriptionError'));

      const newMessages = [];
      if (transcript) {
        newMessages.push(createLocalMessage({
          role: 'user',
          textHe: transcript,
          pronunciationScore: response.pronunciationScore,
        }));
      }
      newMessages.push(createLocalMessage({
        role: 'assistant',
        textHe: assistantText,
        textAr: response.answerAr,
        fallbackUsed: response.fallbackUsed,
        fallbackReason: response.fallbackReason,
        audioBase64: response.audioBase64,
      }));
      setMessages((curr) => [...curr, ...newMessages]);

      // In free-conversation mode the reply is read aloud; a one-shot voice
      // message just shows the text reply.
      if (response.answerHe && !response.fallbackUsed && speakReplyRef.current) {
        void playAssistantReply({
          textHe: response.answerHe,
          audioBase64: response.audioBase64,
          fallbackUsed: response.fallbackUsed,
          pronunciationScore: response.pronunciationScore,
        });
      }

      await refreshConversations();
    } catch (error) {
      presentError(error);
    } finally {
      clearTimeout(phaseTimer);
      recorder.clearAudio();
      setVoiceProcessing(false);
      setLoading(false);
    }
  }, [
    conversationId,
    includeArabic,
    loading,
    playAssistantReply,
    recorder,
    t,
  ]);

  useEffect(() => {
    if (!recorder.audioBlob) return;
    void submitVoiceMessage(recorder.audioBlob);
  }, [recorder.audioBlob, submitVoiceMessage]);

  const handleVoiceCapture = useCallback(async (speakReply) => {
    setErrorMessage('');
    recorder.clearError();
    // Lock in whether this turn's reply is read aloud before recording starts.
    if (recorder.status !== 'recording') {
      speakReplyRef.current = Boolean(speakReply);
    }
    await recorder.toggleRecording();
  }, [recorder]);

  // Switching modes stops any dangling recording and silences playback.
  useEffect(() => {
    if (recorder.status === 'recording') {
      recorder.stopRecording();
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
    audioElementRef.current?.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMode]);

  const isHe = i18n.language === 'he';

  const FEATURE_CARDS = [
    {
      icon: <Sparkles className="h-5 w-5 text-violet-600" />,
      title: isHe ? 'חכם בלימודים'   : 'ذكي في التعلم',
      desc:  isHe ? 'הסברים ברורים, מותאמים לתוכנית הלימודים שלך' : 'شرح واضح، ملائم لمنهجك الدراسي',
    },
    {
      icon: <Star className="h-5 w-5 text-violet-600" />,
      title: isHe ? 'עוזר זמין תמיד' : 'مساعد دائماً',
      desc:  isHe ? 'תשובות מהירות, 24/7, בכל זמן ומקום' : 'ردود سريعة 24/7، في أي وقت ومكان',
    },
    {
      icon: <Globe className="h-5 w-5 text-violet-600" />,
      title: isHe ? 'דו-לשוני'        : 'ثنائي اللغة',
      desc:  isHe ? 'עברית ועברית — למידה והבנה ללא גבולות' : 'عربية وعبرية — تعلّم بلا حدود',
    },
    {
      icon: <ShieldCheck className="h-5 w-5 text-violet-600" />,
      title: isHe ? 'אישי ובטוח'      : 'خاص وآمن',
      desc:  isHe ? 'המידע שלך נשמר בצורה מאובטחת' : 'معلوماتك محفوظة بأمان تام',
    },
  ];

  const endReviewLabel  = isHe ? 'סיום ומשוב' : 'إنهاء وتقييم';
  const newChatLabel    = isHe ? 'שיחה חדשה'  : 'محادثة جديدة';
  const historyLabel    = isHe ? 'היסטוריה'   : 'السجل';
  const chatModeTitle   = isHe ? 'צ׳אט לימודי' : 'دردشة تعليمية';
  const homeLabel       = isHe ? 'דף הבית' : 'الصفحة الرئيسية';
  const modeSelectorLabel = isHe ? 'מצב קלט' : 'وضع الإدخال';

  // The three real interaction modes — shared by the empty state and the
  // composer's segmented selector.
  const INPUT_MODES = [
    { value: 'text',  label: isHe ? 'טקסט' : 'نص',               hint: isHe ? 'כתבי הודעה' : 'اكتبي رسالة',          Icon: Keyboard },
    { value: 'voice', label: isHe ? 'הודעה קולית' : 'رسالة صوتية', hint: isHe ? 'הקליטי ושלחי' : 'سجّلي وأرسلي',       Icon: Mic },
    { value: 'free',  label: isHe ? 'שיחה חופשית' : 'محادثة صوتية', hint: isHe ? 'דברי, ואשיב בקול' : 'تحدّثي وسأجيب صوتًا', Icon: Volume2 },
  ];

  const activeModeLabel = INPUT_MODES.find((mode) => mode.value === inputMode)?.label || '';
  const chatModeHint = isHe ? `עברית · ${activeModeLabel}` : `العبرية · ${activeModeLabel}`;

  const voiceCaption = !recorder.isSupported
    ? t('chatVoiceUnsupported')
    : recorder.status === 'recording'
      ? (isHe ? 'מקשיבה… הקישי לסיום' : 'أستمع… اضغطي للإنهاء')
      : (voiceProcessing || loading)
        ? t('chatThinking')
        : isSpeaking
          ? (isHe ? 'משמיעה תשובה…' : 'أشغّل الإجابة…')
          : inputMode === 'free'
            ? (isHe ? 'הקישי כדי לדבר' : 'اضغطي للتحدث')
            : (isHe ? 'הקישי כדי להקליט' : 'اضغطي للتسجيل');

  const voiceHint = inputMode === 'free'
    ? (isHe ? 'שיחה חופשית — אשיב גם בקול' : 'محادثة حرة — سأجيب صوتًا أيضًا')
    : (isHe ? 'הודעה קולית אחת — אשיב בטקסט' : 'رسالة صوتية واحدة — سأجيب نصًا');

  return (
    /* Force LTR for the layout grid so the benefit cards stay on the physical
       left for both Hebrew and Arabic; every text node inside stays RTL. */
    <div dir="ltr" className="relative flex min-h-screen flex-col overflow-hidden bg-[linear-gradient(180deg,#FAF7FF_0%,#FBF6FD_52%,#F4ECFF_100%)] text-slate-900">

      {/* Decorative background — blurred lavender blobs + faint desk scene */}
      <div className="chatbot-bg" aria-hidden="true">
        <span className="chatbot-bg__blob chatbot-bg__blob--1" />
        <span className="chatbot-bg__blob chatbot-bg__blob--2" />
        <span className="chatbot-bg__blob chatbot-bg__blob--3" />
        <img src="/ai.png" alt="" className="chatbot-bg__desk" loading="lazy" />
      </div>

      {/* ── Header ── */}
      <header dir="ltr" className="relative z-10 flex shrink-0 items-center justify-between border-b border-violet-100/80 bg-white/75 px-4 py-2.5 backdrop-blur-md sm:px-6">
        <div dir={isHe ? 'rtl' : 'ltr'}>
          <LanguageToggle />
        </div>
        <button
          type="button"
          onClick={() => navigate('/home')}
          className="rounded-2xl transition hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          aria-label={homeLabel}
        >
          <LisanLogo className="!h-11 sm:!h-12" />
        </button>
      </header>

      {/* ── Body ── */}
      <div className="relative z-10 mx-auto flex w-full max-w-[1240px] flex-1 min-h-0 flex-col gap-4 px-3 pb-28 pt-4 sm:px-4 lg:flex-row lg:gap-5">

        {/* ── Benefit cards: vertical sidebar on desktop, horizontal scroll on mobile ── */}
        <motion.aside
          className="lisan-feature-rail flex shrink-0 gap-3 overflow-x-auto pb-1 lg:w-60 lg:flex-col lg:overflow-visible lg:pb-0"
          aria-label={isHe ? 'יתרונות הצ׳אט' : 'مزايا الدردشة'}
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {FEATURE_CARDS.map((card) => (
            <div key={card.title} className="lisan-feature-card bg-white">
              <span className="lisan-feature-card__icon" aria-hidden="true">{card.icon}</span>
              <p dir="rtl" className="lisan-feature-card__title">{card.title}</p>
              <p dir="rtl" className="lisan-feature-card__desc">{card.desc}</p>
            </div>
          ))}
        </motion.aside>

        {/* ── Chat column ── */}
        <div className="flex min-w-0 min-h-0 flex-1 flex-col gap-2">

          {errorMessage ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert" dir="rtl">
              {errorMessage}
            </div>
          ) : null}

          {/* Main chat panel — bg-white kept as a utility so dark-mode overrides apply */}
          <motion.div
            className="chatbot-panel bg-white flex min-h-0 flex-1 flex-col"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Top mini-toolbar (RTL): mode title on the start, controls on the end */}
            <div dir="rtl" className="chatbot-toolbar">
              <div className="chatbot-toolbar__brand">
                <span className="chatbot-toolbar__badge" aria-hidden="true">
                  <BotMessageSquare className="h-[18px] w-[18px]" />
                </span>
                <span className="chatbot-toolbar__titles">
                  <span className="chatbot-toolbar__title">{chatModeTitle}</span>
                  <span className="chatbot-toolbar__hint">{chatModeHint}</span>
                </span>
              </div>

              <div className="chatbot-toolbar__actions">
                <button
                  type="button"
                  onClick={endAndReview}
                  disabled={loading || messages.length === 0}
                  className="chatbot-toolbar__end"
                >
                  {endReviewLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  disabled={loading}
                  className="chatbot-toolbar__icon-btn"
                  aria-label={historyLabel}
                  title={historyLabel}
                >
                  <History className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={resetConversation}
                  disabled={loading}
                  className="chatbot-toolbar__icon-btn is-primary"
                  aria-label={newChatLabel}
                  title={newChatLabel}
                >
                  <MessageSquarePlus className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Messages / empty state */}
            <div className="flex min-h-0 flex-1 flex-col">
              <ChatWindow
                messages={messages}
                loading={loading}
                loadingLabel={
                  voiceProcessing
                    ? t(voicePhase === 'analyzing' ? 'chatVoiceAnalyzing' : 'chatVoiceProcessing')
                    : t('chatThinking')
                }
                emptyTitle={t('chatEmptyTitle')}
                emptyDescription={t('chatEmptyDescription')}
                onReadAloud={playAssistantReply}
                readAloudLoadingId={readAloudLoadingId}
                readAloudPlayingId={readAloudPlayingId}
                readAloudLabel={isHe ? 'השמעת התגובה' : 'تشغيل الرد صوتيًا'}
              />
            </div>

            {/* Composer region — mode selector + Arabic toggle + per-mode input */}
            <div className="chatbot-panel__composer">
              <div className="chatbot-composer">
                <div className="chatbot-composer__top">
                  <div className="chatbot-modes" role="group" aria-label={modeSelectorLabel} dir="rtl">
                    {INPUT_MODES.map((mode) => {
                      const Icon = mode.Icon;
                      const active = inputMode === mode.value;
                      return (
                        <button
                          key={mode.value}
                          type="button"
                          onClick={() => setInputMode(mode.value)}
                          aria-pressed={active}
                          className={`chatbot-modes__btn${active ? ' is-active' : ''}`}
                          title={mode.label}
                        >
                          <Icon className="h-4 w-4" aria-hidden="true" />
                          <span>{mode.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={includeArabic}
                    onClick={toggleArabic}
                    disabled={loading}
                    className={`chat-composer__arabic-toggle${includeArabic ? ' is-on' : ''}`}
                  >
                    <span className="chat-composer__toggle-track" aria-hidden="true">
                      <span className="chat-composer__toggle-thumb" />
                    </span>
                    <span className="chat-composer__toggle-label">{t('chatIncludeArabic')}</span>
                  </button>
                </div>

                {inputMode === 'text' ? (
                  <ChatComposer
                    value={composerValue}
                    disabled={loading}
                    loading={loading}
                    onChange={setComposerValue}
                    onSubmit={() => submitMessage()}
                    placeholder={t('chatComposerPlaceholder')}
                    sendLabel={t('chatSend')}
                  />
                ) : (
                  <VoiceConsole
                    variant={inputMode}
                    recording={recorder.status === 'recording'}
                    busy={loading}
                    supported={recorder.isSupported}
                    caption={voiceCaption}
                    hint={voiceHint}
                    onTap={() => handleVoiceCapture(inputMode === 'free')}
                  />
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <ConversationSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        activeConversationId={conversationId}
        loading={conversationsLoading}
        title={t('chatHistoryTitle')}
        subtitle={t('chatHistorySubtitle')}
        loadingLabel={t('chatHistoryLoading')}
        newChatLabel={t('chatNewConversation')}
        emptyLabel={t('chatHistoryEmpty')}
        deleteLabel={t('chatHistoryDeleteLabel')}
        closeLabel={t('chatCloseSidebar')}
        cancelDeleteLabel={t('chatCancelDelete')}
        onNewChat={resetConversation}
        onSelectConversation={openConversation}
        onDeleteConversation={removeConversation}
      />

      <ChatReview
        open={reviewOpen}
        role="student"
        onClose={skipReview}
        onSubmit={submitReview}
      />

      <BottomNav />
    </div>
  );
}

export default ChatbotPage;
