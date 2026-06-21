import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Mic, Square, Keyboard, Volume2, MessageSquarePlus, History, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader.jsx';
import VoiceOrb from '../components/VoiceOrb.jsx';
import ChatReview from '../components/chat/ChatReview.jsx';
import { getStoredToken } from '../services/auth.js';
import { useAudioRecorder } from '../hooks/useAudioRecorder.js';
import { useWhisperTranscription } from '../hooks/useWhisperTranscription.js';

const API_BASE_URL = '/api';

const MODES = [
  { value: 'text', label: { ar: 'نص', he: 'טקסט' }, Icon: Keyboard },
  { value: 'voiceEdit', label: { ar: 'تسجيل وتعديل', he: 'דיבור ועריכה' }, Icon: Mic },
  { value: 'handsfree', label: { ar: 'محادثة صوتية', he: 'שיחה חופשית' }, Icon: Volume2 },
];

const CHATBOT_TEXT = {
  ar: {
    initialMessage: 'أهلاً! كيف أقدر أساعدك اليوم؟',
    replyError: 'حدث خطأ أثناء إنشاء الرد.',
    serverError: 'حدث خطأ في الاتصال بالخادم.',
    review: 'إنهاء وتقييم',
    historyTitle: 'المحادثات السابقة',
    close: 'إغلاق',
    loading: 'جارٍ التحميل...',
    emptyHistory: 'لا توجد محادثات سابقة.',
    conversation: 'محادثة',
    deleteConversation: 'حذف المحادثة',
    orb: {
      idle: 'اضغطي للتحدث',
      listening: 'أسمعك... اضغطي للإنهاء',
      thinking: 'جارٍ المعالجة...',
      speaking: 'يتحدث...',
    },
    loadingModel: 'جارٍ تحميل النموذج...',
    loadingSpeechModel: 'جارٍ تحميل نموذج التعرف على الصوت...',
    recording: 'جارٍ التسجيل...',
    transcribing: 'جارٍ تحويل الصوت...',
    genericError: 'حدث خطأ. حاولي مرة أخرى.',
    send: 'إرسال',
    thinking: 'يفكّر...',
    placeholder: 'اكتبي رسالة...',
    startRecording: 'بدء التسجيل',
    stopRecording: 'إيقاف التسجيل',
  },
  he: {
    initialMessage: 'שלום! איך אפשר לעזור לך היום?',
    replyError: 'אירעה שגיאה ביצירת תשובה.',
    serverError: 'אירעה שגיאה בחיבור לשרת.',
    review: 'סיום ומשוב',
    historyTitle: 'השיחות הקודמות',
    close: 'סגור',
    loading: 'טוען...',
    emptyHistory: 'אין שיחות קודמות.',
    conversation: 'שיחה',
    deleteConversation: 'מחק שיחה',
    orb: {
      idle: 'הקש כדי לדבר',
      listening: 'מקשיב... הקש לסיום',
      thinking: 'מעבד...',
      speaking: 'מדבר...',
    },
    loadingModel: 'טוען מודל...',
    loadingSpeechModel: 'טוען מודל זיהוי דיבור...',
    recording: 'מקליט...',
    transcribing: 'מתמלל...',
    genericError: 'אירעה שגיאה. נסו שוב.',
    send: 'שלח',
    thinking: 'חושב...',
    placeholder: 'הקלד הודעה...',
    startRecording: 'התחלת הקלטה',
    stopRecording: 'עצירת הקלטה',
  },
};

const createMessageId = (role) =>
  `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const mapBackendMessageToUi = (message) => ({
  id: createMessageId(message.sender || 'message'),
  role: message.sender === 'ai' ? 'bot' : 'user',
  text: message.text,
});

function Chatbot({
  title,
  subtitle,
  initialMessage = null,
  scenario = null,
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'he' ? 'he' : 'ar';
  const text = CHATBOT_TEXT[language];

  const [searchParams, setSearchParams] = useSearchParams();

  const [chatId, setChatId] = useState(searchParams.get('chatId'));

  const [messages, setMessages] = useState(() => [
    {
      id: 'welcome',
      role: 'bot',
      text: initialMessage || text.initialMessage,
    },
  ]);

  const [input, setInput] = useState('');
  const [loadingChat, setLoadingChat] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputMode, setInputMode] = useState('text');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [readingMessageId, setReadingMessageId] = useState(null);
  const [voiceEditBusy, setVoiceEditBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewedChats, setReviewedChats] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('lisan-reviewed-chats') || '[]'); } catch { return []; }
  });

  // ── Stored-chat management (previous conversations) ──
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);

  // ── Voice hooks ──
  const recorder = useAudioRecorder();
  const whisper = useWhisperTranscription();

  // The mode that OWNS the current recording/transcript. Captured at record-start
  // so a transcript can only ever be consumed by the mode that produced it.
  const transcriptOriginRef = useRef(null);
  const consumedTranscriptRef = useRef('');

  // ── Route a finished recording by mode ──
  //   handsfree → server STT (Azure) + chat + Azure TTS via /chats/voice
  //   voiceEdit → in-browser Whisper (kept as backup; transcribe-to-edit)
  useEffect(() => {
    if (!recorder.audioBlob) return;
    const blob = recorder.audioBlob;
    recorder.clearAudio();
    if (transcriptOriginRef.current === 'handsfree') {
      sendVoiceMessage(blob);
    } else {
      transcribeVoiceEdit(blob);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.audioBlob]);

  const hasSetupChat = useRef(false);

  const request = async (path, options = {}) => {
    const token = getStoredToken();

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  };

  useEffect(() => {
    if (hasSetupChat.current) {
      return;
    }

    hasSetupChat.current = true;

    const setupChat = async () => {
      try {
        const currentChatId = searchParams.get('chatId');

        if (currentChatId) {
          const data = await request(`/chats/${currentChatId}`);
          const backendMessages = data.chat?.messages || [];
          setChatId(currentChatId);
          if (backendMessages.length > 0) {
            setMessages(backendMessages.map(mapBackendMessageToUi));
          }
          return;
        }

        const data = await request('/chats', {
          method: 'POST',
          body: JSON.stringify({
            title: title || t('chatbot'),
            level: 'A1',
            // Binds this conversation to a quick-activity mode (role-play,
            // quiz ...) so every turn drives that activity in the ai-service.
            ...(scenario ? { scenario } : {}),
          }),
        });

        const newChatId = data.chat.id;
        setChatId(newChatId);
        setSearchParams({ chatId: newChatId });
      } catch (error) {
        console.error('Failed to setup chat:', error);
      } finally {
        setLoadingChat(false);
      }
    };

    setupChat();
  }, []);

  // ── Shared send helper (used by form submit AND handsfree auto-send) ──
  const sendTextMessage = useCallback(
    async (messageText) => {
      const trimmed = messageText.trim();
      if (!trimmed || sending || !chatId) return null;

      const tempUserMessage = {
        id: createMessageId('user'),
        role: 'user',
        text: trimmed,
      };

      setMessages((cur) => [...cur, tempUserMessage]);
      setSending(true);

      try {
        const data = await request(`/chats/${chatId}/ai-message`, {
          method: 'POST',
          body: JSON.stringify({ text: trimmed }),
        });

        const replyText = data.aiMessage?.text || text.replyError;

        const aiMessage = {
          id: createMessageId('bot'),
          role: 'bot',
          text: replyText,
        };

        setMessages((cur) => [...cur, aiMessage]);
        return replyText;
      } catch (err) {
        console.error('Failed to send AI message:', err);
        setMessages((cur) => [
          ...cur,
          {
            id: createMessageId('bot'),
            role: 'bot',
            text: text.serverError,
          },
        ]);
        return null;
      } finally {
        setSending(false);
      }
    },
    [chatId, sending, text.replyError, text.serverError],
  );

  // Form submit handler (text & voiceEdit modes)
  const sendMessage = async (event) => {
    event.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput) return;
    setInput('');
    await sendTextMessage(trimmedInput);
  };

  const speakingUtteranceRef = useRef(null);

  const speakReply = useCallback((replyText) => {
    if (!replyText || typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }
    setIsSpeaking(true);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(replyText);
    utterance.lang = 'he-IL';
    utterance.onend = () => {
      setIsSpeaking(false);
      speakingUtteranceRef.current = null;
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      speakingUtteranceRef.current = null;
    };
    speakingUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, []);

  // ── Audio playback: prefer Azure MP3 (audioBase64); fall back to the
  //    browser speechSynthesis if it's missing or fails to play. ──
  const audioElementRef = useRef(null);

  const stopAudioPlayback = useCallback(() => {
    if (audioElementRef.current) {
      try { audioElementRef.current.pause(); } catch { /* ignore */ }
      audioElementRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const playReplyAudio = useCallback((audioBase64, fallbackText) => {
    if (audioBase64) {
      try {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
        const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
        audioElementRef.current = audio;
        setIsSpeaking(true);
        audio.onended = () => {
          setIsSpeaking(false);
          audioElementRef.current = null;
        };
        audio.onerror = () => {
          audioElementRef.current = null;
          speakReply(fallbackText);
        };
        audio.play().catch(() => {
          audioElementRef.current = null;
          speakReply(fallbackText);
        });
        return;
      } catch {
        // fall through to browser TTS
      }
    }
    speakReply(fallbackText);
  }, [speakReply]);

  const readMessageAloud = useCallback(async (message) => {
    const replyText = (message?.text || '').trim();
    if (!replyText) return;

    stopAudioPlayback();
    setReadingMessageId(message.id);

    try {
      const data = await request('/chats/tts', {
        method: 'POST',
        body: JSON.stringify({ text: replyText }),
      });
      playReplyAudio(data.audioBase64 || null, replyText);
    } catch (err) {
      console.error('Read aloud failed:', err);
      speakReply(replyText);
    } finally {
      setReadingMessageId(null);
    }
  }, [playReplyAudio, speakReply, stopAudioPlayback]);

  // ── Handsfree voice turn: upload audio → Azure STT + chat + Azure TTS ──
  const sendVoiceMessage = useCallback(
    async (blob) => {
      if (!blob || sending || !chatId) return;
      setSending(true);
      try {
        const token = getStoredToken();
        const form = new FormData();
        // Normalize to plain audio/webm (backend allow-list is exact-match).
        const file = new File([blob], 'voice.webm', { type: 'audio/webm' });
        form.append('audio', file);
        form.append('conversationId', chatId);
        form.append('level', 'A1');

        const response = await fetch(`${API_BASE_URL}/chats/voice`, {
          method: 'POST',
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: form,
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Voice request failed');
        }

        const userText = (data.transcribedText || '').trim();
        const replyText = data.answerHe || data.text || '';

        if (userText) {
          setMessages((cur) => [
            ...cur,
            { id: createMessageId('user'), role: 'user', text: userText },
          ]);
        }
        if (replyText) {
          setMessages((cur) => [
            ...cur,
            { id: createMessageId('bot'), role: 'bot', text: replyText },
          ]);
        }
        playReplyAudio(data.audioBase64 || null, replyText);
      } catch (err) {
        console.error('Voice message failed:', err);
        setMessages((cur) => [
          ...cur,
          { id: createMessageId('bot'), role: 'bot', text: text.serverError },
        ]);
      } finally {
        setSending(false);
      }
    },
    [chatId, sending, playReplyAudio, text.serverError],
  );

  // ── Voice-edit STT via Azure (server); Whisper is the fallback only. ──
  const transcribeVoiceEdit = useCallback(
    async (blob) => {
      if (!blob) return;
      setVoiceEditBusy(true);
      try {
        const token = getStoredToken();
        const form = new FormData();
        const file = new File([blob], 'voice.webm', { type: 'audio/webm' });
        form.append('audio', file);

        const response = await fetch(`${API_BASE_URL}/chats/transcribe`, {
          method: 'POST',
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: form,
        });
        const data = await response.json().catch(() => ({}));
        const transcript = (data?.transcribedText || '').trim();

        if (response.ok && transcript) {
          setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        } else {
          whisper.transcribe(blob); // fallback to in-browser Whisper
        }
      } catch (err) {
        console.error('Server STT failed, using Whisper fallback:', err);
        whisper.transcribe(blob);
      } finally {
        setVoiceEditBusy(false);
      }
    },
    [whisper],
  );

  // ── Single consumer for completed transcripts (routed by origin) ──
  useEffect(() => {
    if (whisper.status !== 'done') return;
    const text = (whisper.transcript || '').trim();
    if (!text) return;
    if (text === consumedTranscriptRef.current) return;

    const origin = transcriptOriginRef.current;
    if (origin !== inputMode) return;

    consumedTranscriptRef.current = text;

    if (origin === 'voiceEdit') {
      console.log('WHISPER TRANSCRIPT (voiceEdit):', text);
      setInput((prev) => (prev ? `${prev} ${text}` : text));
    } else if (origin === 'handsfree') {
      console.log('WHISPER TRANSCRIPT (handsfree):', text);
      (async () => {
        const replyText = await sendTextMessage(text);
        if (replyText) speakReply(replyText);
      })();
    }
  }, [whisper.status, whisper.transcript, inputMode, sendTextMessage, speakReply]);

  // ── Reset pending state whenever the mode changes ──
  const prevModeRef = useRef(inputMode);
  useEffect(() => {
    if (prevModeRef.current === inputMode) return;
    prevModeRef.current = inputMode;

    setInput('');
    transcriptOriginRef.current = null;
    whisper.reset();

    if (recorder.status === 'recording') {
      recorder.stopRecording();
    }

    stopAudioPlayback();
    speakingUtteranceRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (audioElementRef.current) {
        try { audioElementRef.current.pause(); } catch { /* ignore */ }
        audioElementRef.current = null;
      }
    };
  }, []);

  // ── Sliding toggle thumb positioning ──
  const segRefs = useRef({});
  const [thumbStyle, setThumbStyle] = useState({ left: 0, width: 0, opacity: 0 });

  const measureThumb = useCallback(() => {
    const el = segRefs.current[inputMode];
    if (el) {
      setThumbStyle({ left: el.offsetLeft, width: el.offsetWidth, opacity: 1 });
    }
  }, [inputMode]);

  useLayoutEffect(() => {
    measureThumb();
    const id = setTimeout(measureThumb, 80);
    return () => clearTimeout(id);
  }, [measureThumb]);

  useEffect(() => {
    window.addEventListener('resize', measureThumb);
    return () => window.removeEventListener('resize', measureThumb);
  }, [measureThumb]);

  // ── Derived handsfree orb state ──
  const orbState = (() => {
    if (isSpeaking) return 'speaking';
    if (recorder.status === 'recording') return 'listening';
    if (
      whisper.status === 'loading-model' ||
      whisper.status === 'transcribing' ||
      sending
    ) {
      return 'thinking';
    }
    return 'idle';
  })();

  const ORB_CAPTIONS = text.orb;

  const handleOrbTap = useCallback(() => {
    if (orbState === 'thinking' || orbState === 'speaking') return;
    if (recorder.status === 'recording') {
      recorder.stopRecording();
    } else {
      transcriptOriginRef.current = 'handsfree';
      recorder.startRecording();
    }
  }, [orbState, recorder]);

  const handleVoiceEditToggle = useCallback(() => {
    if (recorder.status === 'recording') {
      recorder.stopRecording();
    } else {
      transcriptOriginRef.current = 'voiceEdit';
      recorder.startRecording();
    }
  }, [recorder]);

  const isRecording = recorder.status === 'recording';

  const endAndReview = () => {
    if (!chatId || reviewedChats.includes(chatId)) return;
    setReviewOpen(true);
  };

  const submitReview = async ({ rating, comment }) => {
    try {
      const token = getStoredToken();
      if (chatId) {
        await fetch(`http://localhost:3000/api/chats/${chatId}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ rating, comment, role: 'student', scenario: scenario || null }),
        });
        const next = [...reviewedChats, chatId];
        setReviewedChats(next);
        try { sessionStorage.setItem('lisan-reviewed-chats', JSON.stringify(next)); } catch {}
      }
    } catch (e) { /* ignore */ }
    finally { setReviewOpen(false); }
  };

  const skipReview = () => {
    if (chatId) {
      const next = [...reviewedChats, chatId];
      setReviewedChats(next);
      try { sessionStorage.setItem('lisan-reviewed-chats', JSON.stringify(next)); } catch {}
    }
    setReviewOpen(false);
  };

  return (
    <main
      className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_100%)] px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 lg:px-8"
      translate="no"
    >
      <div className="mx-auto w-full max-w-6xl">
        <PageHeader showBack backTo="/home" />

        <section className="mt-6 flex min-h-[calc(100vh-9rem)] flex-col rounded-3xl bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {title || t('chatbot')}
              </h1>

              {subtitle ? (
                <p className="mt-2 text-sm font-semibold text-violet-700">
                  {subtitle}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={endAndReview}
              disabled={!chatId || messages.length <= 1}
              className="flex h-10 items-center gap-1.5 rounded-full border border-violet-200 bg-white px-4 text-sm font-bold text-violet-700 shadow-sm transition hover:bg-violet-50 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-violet-500"
              title={text.review}
            >
              {text.review}
            </button>
          </div>

          {showHistory ? (
            <div dir="rtl" className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-bold text-slate-800">{text.historyTitle}</p>
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  aria-label={text.close}
                  className="rounded-full p-1 text-slate-400 transition hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {loadingConversations ? (
                <p className="py-3 text-center text-sm text-slate-500">{text.loading}</p>
              ) : conversations.length === 0 ? (
                <p className="py-3 text-center text-sm text-slate-500">
                  {text.emptyHistory}
                </p>
              ) : (
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {conversations.map((conversation) => (
                    <li key={conversation.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => loadConversation(conversation.id)}
                        className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-right transition hover:bg-white ${
                          conversation.id === chatId
                            ? 'bg-white ring-1 ring-violet-300'
                            : ''
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                          {conversation.title || text.conversation}
                          <span className="mr-2 text-xs font-normal text-slate-400">
                            ({conversation.messagesCount || 0})
                          </span>
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) =>
                            removeConversation(conversation.id, event)
                          }
                          aria-label={text.deleteConversation}
                          className="shrink-0 rounded-full p-1 text-slate-400 transition hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          <div
            className="mt-5 flex flex-1 flex-col gap-2 overflow-y-auto pb-4"
            dir="rtl"
          >
            {loadingChat ? (
              <div className="self-start rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
                Loading chat...
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[78%] lg:max-w-[64%] ${msg.role === 'user'
                    ? 'self-end bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white'
                    : 'self-start bg-slate-100 text-slate-900'
                    }`}
                >
                  <span>{msg.text}</span>
                  {msg.role === 'bot' && msg.text ? (
                    <button
                      type="button"
                      onClick={() => readMessageAloud(msg)}
                      disabled={readingMessageId === msg.id}
                      aria-label="Read aloud"
                      title="Read aloud"
                      dir="ltr"
                      className="mt-2 flex w-fit items-center gap-1 rounded-full border border-violet-200 bg-white/80 px-2.5 py-1 text-xs font-semibold text-violet-700 transition hover:bg-white disabled:cursor-wait disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-violet-400"
                    >
                      <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Read aloud</span>
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>

          {/* ── Glossy sliding mode toggle ── */}
          <div className="mt-auto flex justify-center" dir="rtl">
            <div
              className="relative inline-flex gap-0 rounded-full p-[5px]"
              style={{
                background: '#EDE7FB',
                boxShadow: 'inset 0 1px 3px rgba(91,33,182,0.18)',
              }}
            >
              <span
                aria-hidden="true"
                className="absolute rounded-full"
                style={{
                  top: 5,
                  bottom: 5,
                  left: thumbStyle.left,
                  width: thumbStyle.width,
                  opacity: thumbStyle.opacity,
                  background:
                    'linear-gradient(135deg,#8B5CF6,#7C3AED 55%,#6D28D9)',
                  boxShadow:
                    '0 4px 12px rgba(124,58,237,0.45), inset 0 1px 0 rgba(255,255,255,0.35)',
                  transition: 'all 0.32s cubic-bezier(0.4,0,0.2,1)',
                }}
              />
              {MODES.map((mode) => {
                const active = inputMode === mode.value;
                const Icon = mode.Icon;
                return (
                  <button
                    key={mode.value}
                    ref={(el) => {
                      segRefs.current[mode.value] = el;
                    }}
                    type="button"
                    onClick={() => setInputMode(mode.value)}
                    className="relative z-10 flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors sm:text-sm"
                    style={{ color: active ? '#ffffff' : '#6D28D9' }}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {mode.label[language]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Input area per mode ── */}
          {inputMode === 'handsfree' ? (
            <div className="mt-6 flex flex-col items-center justify-center gap-4 pb-2">
              <VoiceOrb state={orbState} onClick={handleOrbTap} size={typeof window !== 'undefined' && window.innerWidth < 640 ? 110 : 140} />

              <p className="text-sm font-semibold text-violet-700">
                {ORB_CAPTIONS[orbState]}
              </p>

              {whisper.status === 'loading-model' && (
                <p className="text-xs text-violet-500">
                  {text.loadingModel} {whisper.progress}%
                </p>
              )}
            </div>
          ) : (
            <>
              {inputMode === 'voiceEdit' && (
                <div className="mt-5 flex flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={handleVoiceEditToggle}
                    className="flex h-[72px] w-[72px] items-center justify-center rounded-full transition-transform active:scale-95"
                    style={{
                      background: isRecording
                        ? 'linear-gradient(135deg,#FB7185,#E11D48 60%,#BE123C)'
                        : 'linear-gradient(135deg,#A78BFA,#7C3AED 60%,#6D28D9)',
                      boxShadow: isRecording
                        ? '0 10px 28px rgba(225,29,72,0.45), inset 0 2px 3px rgba(255,255,255,0.35)'
                        : '0 10px 28px rgba(124,58,237,0.45), inset 0 2px 3px rgba(255,255,255,0.4), inset 0 -3px 6px rgba(91,33,182,0.4)',
                    }}
                    aria-label={isRecording ? text.stopRecording : text.startRecording}
                  >
                    {isRecording ? (
                      <Square className="h-6 w-6 text-white" aria-hidden="true" />
                    ) : (
                      <Mic className="h-7 w-7 text-white" aria-hidden="true" />
                    )}
                  </button>

                  {isRecording && (
                    <p className="text-xs font-semibold text-rose-500">{text.recording}</p>
                  )}
                  {voiceEditBusy && (
                    <p className="text-xs text-violet-600">{text.transcribing}</p>
                  )}
                  {whisper.status === 'loading-model' && (
                    <p className="text-xs text-violet-600">
                      {text.loadingSpeechModel} {whisper.progress}%
                    </p>
                  )}
                  {whisper.status === 'transcribing' && (
                    <p className="text-xs text-violet-600">{text.transcribing}</p>
                  )}
                  {whisper.status === 'error' && (
                    <p className="text-xs text-rose-500">{text.genericError}</p>
                  )}
                </div>
              )}

              <form
                className="mt-4 flex items-center gap-2 rounded-[18px] border border-violet-100 bg-white p-2"
                style={{ boxShadow: '0 6px 18px rgba(124,58,237,0.08)' }}
                onSubmit={sendMessage}
                dir="rtl"
              >
                <button
                  type="submit"
                  disabled={sending}
                  className="shrink-0 rounded-[14px] px-5 py-3 text-sm font-bold text-white transition-transform active:scale-95 disabled:opacity-60"
                  style={{
                    background: 'linear-gradient(135deg,#8B5CF6,#7C3AED)',
                    boxShadow:
                      '0 6px 16px rgba(124,58,237,0.35), inset 0 1px 0 rgba(255,255,255,0.3)',
                  }}
                >
                  {sending ? text.thinking : text.send}
                </button>

                <input
                  type="text"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={text.placeholder}
                  className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-slate-800 outline-none placeholder:text-violet-300"
                  disabled={sending}
                  dir="rtl"
                />
              </form>
            </>
          )}
        </section>
        <ChatReview
          open={reviewOpen}
          role="student"
          onClose={skipReview}
          onSubmit={submitReview}
        />
      </div>
    </main>
  );
}

export default Chatbot;
