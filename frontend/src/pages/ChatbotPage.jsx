/**
 * ChatbotPage.jsx  —  Sprint 4 MVP
 *
 * This page is used for:
 *  1. Main chat page.
 *  2. Short activity chat page with the same main chat design.
 *
 * For short activities, ScenarioChat.jsx can pass:
 *  activityId
 *  title
 *  subtitle
 *  initialMessage
 *  placeholderResponse
 *
 * These props are used for UI only.
 * No scenario/activity data is sent to backend or AI service.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import {
  BotMessageSquare,
  Globe,
  History,
  Keyboard,
  Mic,
  MessageSquarePlus,
  ShieldCheck,
  Sparkles,
  Star,
  Volume2,
} from 'lucide-react';

import BottomNav from '../components/BottomNav.jsx';
import LisanHeader from '../components/LisanHeader.jsx';
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

const STT_FALLBACK_REASONS = new Set([
  'STT_EMPTY',
  'STT_FAILED',
  'STT_TIMEOUT',
  'STT_CIRCUIT_OPEN',
]);

function createLocalMessage({
  role,
  textHe,
  textAr = null,
  pending = false,
  fallbackUsed = false,
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

function ChatbotPage({
  activityId = '',
  title = '',
  subtitle = '',
  initialMessage = '',
  placeholderResponse = '',
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const recorder = useAudioRecorder();
  const reduceMotion = useReducedMotion();

  const [inputMode, setInputMode] = useState('text');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioElementRef = useRef(null);
  const speakReplyRef = useRef(false);

  const getInitialMessages = useCallback(() => {
    const cleanedInitialMessage = String(initialMessage || '').trim();

    if (!cleanedInitialMessage) {
      return [];
    }

    return [
      createLocalMessage({
        role: 'assistant',
        textHe: cleanedInitialMessage,
      }),
    ];
  }, [initialMessage]);

  const [composerValue, setComposerValue] = useState('');
  const [messages, setMessages] = useState(() => getInitialMessages());
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(() => searchParams.get('chatId') || null);
  const [loading, setLoading] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewedChats, setReviewedChats] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('lisan-reviewed-chats') || '[]');
    } catch {
      return [];
    }
  });

  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const [voicePhase, setVoicePhase] = useState('listening');
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [readAloudLoadingId, setReadAloudLoadingId] = useState(null);
  const [readAloudPlayingId, setReadAloudPlayingId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [includeArabic, setIncludeArabic] = useState(() => {
    try {
      return sessionStorage.getItem('lisan-include-arabic') === 'true';
    } catch {
      return false;
    }
  });

  const isHe = i18n.language === 'he';
  const isActivityChat = Boolean(activityId || title || subtitle || initialMessage);

  // Load existing chat messages when navigating from history
  const hasLoadedChatRef = useRef(false);
  useEffect(() => {
    const chatIdFromUrl = searchParams.get('chatId');
    if (!chatIdFromUrl || hasLoadedChatRef.current) return;
    hasLoadedChatRef.current = true;

    const loadChat = async () => {
      try {
        const token = getStoredToken();
        const res = await fetch(`/api/chats/${chatIdFromUrl}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        const backendMessages = data.chat?.messages || [];
        if (backendMessages.length > 0) {
          setMessages(
            backendMessages.map((m) =>
              createLocalMessage({
                role: (m.sender === 'user' || m.role === 'user') ? 'user' : 'assistant',
                textHe: m.textHe || m.text || m.content || '',
                textAr: m.textAr || '',
                audioUrl: m.audioUrl || null,
              })
            )
          );
        }
      } catch (err) {
        console.error('Failed to load chat:', err);
      }
    };

    loadChat();
  }, [searchParams]);

  useEffect(() => {
    setMessages(getInitialMessages());
    setConversationId(null);
    setComposerValue('');
    setErrorMessage('');
    setReviewOpen(false);
  }, [getInitialMessages, activityId]);

  const toggleArabic = () => {
    setIncludeArabic((prev) => {
      const next = !prev;

      try {
        sessionStorage.setItem('lisan-include-arabic', String(next));
      } catch {}

      return next;
    });
  };

  const presentError = useCallback(
    (error) => {
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
    },
    [navigate, t]
  );

  const refreshConversations = useCallback(async () => {
    setConversationsLoading(true);

    try {
      const nextConversations = await fetchConversations();
      setConversations(nextConversations);
    } catch (error) {
      presentError(error);
    } finally {
      setConversationsLoading(false);
    }
  }, [presentError]);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

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

  const resetConversation = useCallback(() => {
    setMessages(getInitialMessages());
    setConversationId(null);
    setComposerValue('');
    setErrorMessage('');
  }, [getInitialMessages]);

  const endAndReview = () => {
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
        await fetch(`/api/chats/${conversationId}/review`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ rating, comment, role: 'student' }),
        });

        const next = [...reviewedChats, conversationId];
        setReviewedChats(next);

        try {
          sessionStorage.setItem('lisan-reviewed-chats', JSON.stringify(next));
        } catch {}
      }
    } catch {
      // Ignore review network errors.
    } finally {
      setReviewOpen(false);
      resetConversation();
    }
  };

  const skipReview = () => {
    if (conversationId) {
      const next = [...reviewedChats, conversationId];
      setReviewedChats(next);

      try {
        sessionStorage.setItem('lisan-reviewed-chats', JSON.stringify(next));
      } catch {}
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

      if (targetConversationId === conversationId) {
        resetConversation();
      }
    } catch (error) {
      presentError(error);
    }
  };

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

        if (hebrewVoice) {
          utterance.voice = hebrewVoice;
        }

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

      // Start playback only once the clip is buffered so the audio output
      // device is open before sound begins — otherwise the first word gets
      // clipped. A short fallback timer guarantees we still play if the
      // 'canplaythrough' event never fires (e.g. some mobile browsers).
      let started = false;
      const startPlayback = () => {
        if (started) return;
        started = true;
        audio.play().catch((error) => {
          setIsSpeaking(false);
          reject(error);
        });
      };
      audio.preload = 'auto';
      if (audio.readyState >= 3) {
        startPlayback();
      } else {
        audio.addEventListener('canplaythrough', startPlayback, { once: true });
        window.setTimeout(startPlayback, 300);
      }
    } catch (error) {
      setIsSpeaking(false);
      reject(error);
    }
  }), []);

  const playAssistantReply = useCallback(
    async ({
      localId = null,
      textHe,
      audioBase64 = null,
      fallbackUsed = false,
      pronunciationScore = null,
    }) => {
      const text = (textHe || '').trim();
      if (!text) return;

      setErrorMessage('');

      if (localId) {
        setReadAloudLoadingId(localId);
      }

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
    },
    [playAudioBase64, playBrowserSpeech, t]
  );

  const submitMessage = async (prefilledMessage) => {
    const message = typeof prefilledMessage === 'string' ? prefilledMessage : composerValue;
    const trimmedMessage = message.trim();

    if (!trimmedMessage || loading) return;

    setErrorMessage('');
    setComposerValue('');

    const optimisticUserMessage = createLocalMessage({
      role: 'user',
      textHe: trimmedMessage,
    });

    setMessages((curr) => [...curr, optimisticUserMessage]);
    setLoading(true);

    try {
      const response = await sendChatMessage({
        message: trimmedMessage,
        conversationId,
        level: DEFAULT_CHAT_LEVEL,
        includeArabic,
      });

      const assistantAnswer =
        response.answerHe ||
        placeholderResponse ||
        (isHe ? 'בסדר, נמשיך לתרגל יחד.' : 'حسنًا، سنكمل التدريب معًا.');

      setConversationId(response.conversationId);

      setMessages((curr) => [
        ...curr,
        createLocalMessage({
          role: 'assistant',
          textHe: assistantAnswer,
          textAr: response.answerAr,
          fallbackUsed: response.fallbackUsed,
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

  const submitVoiceMessage = useCallback(
    async (audioBlob) => {
      if (!audioBlob || loading) return;

      setErrorMessage('');
      setVoiceProcessing(true);
      setVoicePhase('listening');
      setLoading(true);

      const phaseTimer = setTimeout(() => setVoicePhase('analyzing'), 2500);

      try {
        const response = await sendVoiceMessage({
          audioBlob,
          conversationId,
          level: DEFAULT_CHAT_LEVEL,
          includeArabic,
        });

        setConversationId(response.conversationId);

        const transcript = (response.transcribedText || '').trim();
        const sttFailed =
          response.fallbackUsed && STT_FALLBACK_REASONS.has(response.fallbackReason);

        const assistantText =
          response.answerHe ||
          placeholderResponse ||
          (sttFailed ? t('chatVoiceNotHeard') : t('chatVoiceTranscriptionError'));

        const newMessages = [];

        if (transcript) {
          newMessages.push(
            createLocalMessage({
              role: 'user',
              textHe: transcript,
              pronunciationScore: response.pronunciationScore,
            })
          );
        }

        newMessages.push(
          createLocalMessage({
            role: 'assistant',
            textHe: assistantText,
            textAr: response.answerAr,
            fallbackUsed: response.fallbackUsed,
            fallbackReason: response.fallbackReason,
            audioBase64: response.audioBase64,
          })
        );

        setMessages((curr) => [...curr, ...newMessages]);

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
    },
    [
      conversationId,
      includeArabic,
      loading,
      playAssistantReply,
      placeholderResponse,
      presentError,
      recorder,
      refreshConversations,
      t,
    ]
  );

  useEffect(() => {
    if (!recorder.audioBlob) return;
    void submitVoiceMessage(recorder.audioBlob);
  }, [recorder.audioBlob, submitVoiceMessage]);

  const handleVoiceCapture = useCallback(
    async (speakReply) => {
      setErrorMessage('');
      recorder.clearError();

      if (recorder.status !== 'recording') {
        speakReplyRef.current = Boolean(speakReply);
      }

      await recorder.toggleRecording();
    },
    [recorder]
  );

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

  const FEATURE_CARDS = [
    {
      icon: <Sparkles className="h-5 w-5 text-violet-600" />,
      title: isHe ? 'חכם בלימודים' : 'ذكي في التعلم',
      desc: isHe
        ? 'הסברים ברורים, מותאמים לתוכנית הלימודים שלך'
        : 'شرح واضح، ملائم لمنهجك الدراسي',
    },
    {
      icon: <Star className="h-5 w-5 text-violet-600" />,
      title: isHe ? 'עוזר זמין תמיד' : 'مساعد دائماً',
      desc: isHe
        ? 'תשובות מהירות, 24/7, בכל זמן ומקום'
        : 'ردود سريعة 24/7، في أي وقت ومكان',
    },
    {
      icon: <Globe className="h-5 w-5 text-violet-600" />,
      title: isHe ? 'דו-לשוני' : 'ثنائي اللغة',
      desc: isHe
        ? 'עברית ועברית — למידה והבנה ללא גבולות'
        : 'عربية وعبرية — تعلّم بلا حدود',
    },
    {
      icon: <ShieldCheck className="h-5 w-5 text-violet-600" />,
      title: isHe ? 'אישי ובטוח' : 'خاص وآمن',
      desc: isHe ? 'המידע שלך נשמר בצורה מאובטחת' : 'معلوماتك محفوظة بأمان تام',
    },
  ];

  const endReviewLabel = isHe ? 'סיום ומשוב' : 'إنهاء وتقييم';
  const newChatLabel = isHe ? 'שיחה חדשה' : 'محادثة جديدة';
  const historyLabel = isHe ? 'היסטוריה' : 'السجل';

  const chatModeTitle = title || (isHe ? 'צ׳אט לימודי' : 'دردشة تعليمية');
  const modeSelectorLabel = isHe ? 'מצב קלט' : 'وضع الإدخال';

  const INPUT_MODES = [
    {
      value: 'text',
      label: isHe ? 'טקסט' : 'نص',
      hint: isHe ? 'כתבי הודעה' : 'اكتبي رسالة',
      Icon: Keyboard,
    },
    {
      value: 'voice',
      label: isHe ? 'הודעה קולית' : 'رسالة صوتية',
      hint: isHe ? 'הקליטי ושלחי' : 'سجّلي وأرسلي',
      Icon: Mic,
    },
    {
      value: 'free',
      label: isHe ? 'שיחה חופשית' : 'محادثة صوتية',
      hint: isHe ? 'דברי, ואשיב בקול' : 'تحدّثي وسأجيب صوتًا',
      Icon: Volume2,
    },
  ];

  const activeModeLabel = INPUT_MODES.find((mode) => mode.value === inputMode)?.label || '';

  const chatModeHint =
    subtitle || (isHe ? `עברית · ${activeModeLabel}` : `العبرية · ${activeModeLabel}`);

  const emptyTitle = isActivityChat
    ? chatModeTitle
    : t('chatEmptyTitle');

  const emptyDescription = isActivityChat
    ? chatModeHint
    : t('chatEmptyDescription');

  const voiceCaption = !recorder.isSupported
    ? t('chatVoiceUnsupported')
    : recorder.status === 'recording'
      ? isHe
        ? 'מקשיבה… הקישי לסיום'
        : 'أستمع… اضغطي للإنهاء'
      : voiceProcessing || loading
        ? t('chatThinking')
        : isSpeaking
          ? isHe
            ? 'משמיעה תשובה…'
            : 'أشغّل الإجابة…'
          : inputMode === 'free'
            ? isHe
              ? 'הקישי כדי לדבר'
              : 'اضغطي للتحدث'
            : isHe
              ? 'הקישי כדי להקליט'
              : 'اضغطي للتسجيل';

  const voiceHint =
    inputMode === 'free'
      ? isHe
        ? 'שיחה חופשית — אשיב גם בקול'
        : 'محادثة حرة — سأجيب صوتًا أيضًا'
      : isHe
        ? 'הודעה קולית אחת — אשיב בטקסט'
        : 'رسالة صوتية واحدة — سأجيب نصًا';

  return (
    <>
      <LisanHeader
        sections={[]}
        logoTarget="/home"
        onLogout={() => {
          logout();
          navigate('/login');
        }}
      />

      <div
        dir="ltr"
        className="relative flex flex-col mt-10 bg-[linear-gradient(180deg,#FAF7FF_0%,#FBF6FD_52%,#F4ECFF_100%)] text-slate-900"
        style={{ minHeight: 'calc(100vh - 80px)' }}
      >
        <div className="chatbot-bg" aria-hidden="true">
          <span className="chatbot-bg__blob chatbot-bg__blob--1" />
          <span className="chatbot-bg__blob chatbot-bg__blob--2" />
          <span className="chatbot-bg__blob chatbot-bg__blob--3" />
        </div>

        <div className="relative z-10 mx-auto flex w-full max-w-[1240px] flex-1 min-h-0 flex-col gap-4 px-3 pb-28 pt-7 sm:px-4 lg:flex-row lg:gap-5">
        <motion.aside
          className="lisan-feature-rail flex shrink-0 gap-3 overflow-x-auto pb-1 lg:w-60 lg:flex-col lg:overflow-visible lg:pb-0"
          aria-label={isHe ? 'יתרונות הצ׳אט' : 'مزايا الدردشة'}
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {FEATURE_CARDS.map((card) => (
            <div key={card.title} className="lisan-feature-card bg-white">
              <span className="lisan-feature-card__icon" aria-hidden="true">
                {card.icon}
              </span>
              <p dir="rtl" className="lisan-feature-card__title">
                {card.title}
              </p>
              <p dir="rtl" className="lisan-feature-card__desc">
                {card.desc}
              </p>
            </div>
          ))}
        </motion.aside>

        <div className="flex min-w-0 min-h-0 flex-1 flex-col gap-2">
          {errorMessage ? (
            <div
              className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
              dir="rtl"
            >
              {errorMessage}
            </div>
          ) : null}

          <motion.div
            className="chatbot-panel bg-white flex min-h-0 flex-1 flex-col"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
          >
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

            <div className="flex min-h-0 flex-1 flex-col">
              <ChatWindow
                messages={messages}
                loading={loading}
                loadingLabel={
                  voiceProcessing
                    ? t(voicePhase === 'analyzing' ? 'chatVoiceAnalyzing' : 'chatVoiceProcessing')
                    : t('chatThinking')
                }
                emptyTitle={emptyTitle}
                emptyDescription={emptyDescription}
                onReadAloud={playAssistantReply}
                readAloudLoadingId={readAloudLoadingId}
                readAloudPlayingId={readAloudPlayingId}
                readAloudLabel={isHe ? 'השמעת התגובה' : 'تشغيل الرد صوتيًا'}
              />
            </div>

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
    </>
  );
}

export default ChatbotPage;
