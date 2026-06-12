import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Mic, Square, Keyboard, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader.jsx';
import VoiceOrb from '../components/VoiceOrb.jsx';
import { getStoredToken } from '../services/auth.js';
import { useAudioRecorder } from '../hooks/useAudioRecorder.js';
import { useWhisperTranscription } from '../hooks/useWhisperTranscription.js';

const API_BASE_URL = 'http://localhost:3000/api';

const MODES = [
  { value: 'text', label: 'טקסט', Icon: Keyboard },
  { value: 'voiceEdit', label: 'דיבור ועריכה', Icon: Mic },
  { value: 'handsfree', label: 'שיחה חופשית', Icon: Volume2 },
];

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
  initialMessage = 'שלום! איך אפשר לעזור לך היום?',
  scenario = null,
}) {
  const { t } = useTranslation();

  const [searchParams, setSearchParams] = useSearchParams();

  const [chatId, setChatId] = useState(searchParams.get('chatId'));

  const [messages, setMessages] = useState(() => [
    {
      id: 'welcome',
      role: 'bot',
      text: initialMessage,
    },
  ]);

  const [input, setInput] = useState('');
  const [loadingChat, setLoadingChat] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputMode, setInputMode] = useState('text');
  const [isSpeaking, setIsSpeaking] = useState(false);

  // ── Voice hooks ──
  const recorder = useAudioRecorder();
  const whisper = useWhisperTranscription();

  // The mode that OWNS the current recording/transcript. Captured at record-start
  // so a transcript can only ever be consumed by the mode that produced it.
  const transcriptOriginRef = useRef(null);
  const consumedTranscriptRef = useRef('');

  // ── Auto-transcribe when recorder produces a blob ──
  useEffect(() => {
    if (recorder.audioBlob) {
      whisper.transcribe(recorder.audioBlob);
      recorder.clearAudio();
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
    async (text) => {
      const trimmed = text.trim();
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

        const replyText = data.aiMessage?.text || 'אירעה שגיאה ביצירת תשובה.';

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
            text: 'אירעה שגיאה בחיבור לשרת.',
          },
        ]);
        return null;
      } finally {
        setSending(false);
      }
    },
    [chatId, sending],
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

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    speakingUtteranceRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
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

  const ORB_CAPTIONS = {
    idle: 'הקש כדי לדבר',
    listening: 'מקשיב… הקש לסיום',
    thinking: 'מעבד…',
    speaking: 'מדבר…',
  };

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

  return (
    <main
      className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_100%)] px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 lg:px-8"
      translate="no"
    >
      <div className="mx-auto w-full max-w-6xl">
        <PageHeader showBack backTo="/home" />

        <section className="mt-6 flex min-h-[calc(100vh-9rem)] flex-col rounded-3xl bg-white p-5 shadow-card sm:p-6">
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
                    {mode.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Input area per mode ── */}
          {inputMode === 'handsfree' ? (
            <div className="mt-6 flex flex-col items-center justify-center gap-4 pb-2">
              <VoiceOrb state={orbState} onClick={handleOrbTap} />

              <p className="text-sm font-semibold text-violet-700">
                {ORB_CAPTIONS[orbState]}
              </p>

              {whisper.status === 'loading-model' && (
                <p className="text-xs text-violet-500">
                  טוען מודל… {whisper.progress}%
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
                    aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                  >
                    {isRecording ? (
                      <Square className="h-6 w-6 text-white" aria-hidden="true" />
                    ) : (
                      <Mic className="h-7 w-7 text-white" aria-hidden="true" />
                    )}
                  </button>

                  {isRecording && (
                    <p className="text-xs font-semibold text-rose-500">מקליט…</p>
                  )}
                  {whisper.status === 'loading-model' && (
                    <p className="text-xs text-violet-600">
                      טוען מודל זיהוי דיבור… {whisper.progress}%
                    </p>
                  )}
                  {whisper.status === 'transcribing' && (
                    <p className="text-xs text-violet-600">מתמלל…</p>
                  )}
                  {whisper.status === 'error' && (
                    <p className="text-xs text-rose-500">אירעה שגיאה. נסו שוב.</p>
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
                  {sending ? 'Thinking...' : 'שלח'}
                </button>

                <input
                  type="text"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="הקלד הודעה…"
                  className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-slate-800 outline-none placeholder:text-violet-300"
                  disabled={sending}
                  dir="rtl"
                />
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

export default Chatbot;