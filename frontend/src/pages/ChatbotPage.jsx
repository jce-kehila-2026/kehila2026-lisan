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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
// framer-motion used inside child components (ConversationSidebar, ChatWindow)
import { BotMessageSquare, History, MessageSquarePlus, ShieldCheck, Sparkles } from 'lucide-react';
import BottomNav from '../components/BottomNav.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ChatComposer from '../components/chat/ChatComposer.jsx';
import ConversationSidebar from '../components/chat/ConversationSidebar.jsx';
import ChatWindow from '../components/chat/ChatWindow.jsx';
import { useAudioRecorder } from '../hooks/useAudioRecorder.js';
import { logout } from '../services/auth.js';
import {
  DEFAULT_CHAT_LEVEL,
  DEFAULT_SUGGESTED_PROMPTS,
  deleteConversation,
  fetchConversation,
  fetchConversations,
  getChatErrorPresentation,
  sendChatMessage,
  sendVoiceMessage,
} from '../services/chat.js';

function createLocalMessage({
  role,
  textHe,
  textAr        = null,
  pending       = false,
  fallbackUsed  = false,
  fallbackReason = null,
}) {
  return {
    localId: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    textHe,
    textAr,
    pending,
    fallbackUsed,
    fallbackReason,
  };
}

function ChatbotPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const recorder = useAudioRecorder();
  const [composerValue, setComposerValue] = useState('');
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
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

  const suggestedPrompts = useMemo(() => DEFAULT_SUGGESTED_PROMPTS, []);
  const voiceStatusLabel = useMemo(() => {
    if (!recorder.isSupported) return t('chatVoiceUnsupported');

    switch (recorder.status) {
      case 'requesting':
        return t('chatVoiceStatusRequesting');
      case 'recording':
        return t('chatVoiceStatusRecording');
      case 'stopping':
        return t('chatVoiceStatusStopping');
      case 'denied':
        return t('chatVoicePermissionDenied');
      case 'error':
        return t('chatVoiceGenericError');
      default:
        return t('chatVoiceStatusIdle');
    }
  }, [recorder.isSupported, recorder.status, t]);

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

      const speakWithVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        const hebrewVoice = voices.find(
          (v) => v.lang === 'he-IL' || v.lang === 'he' || v.lang.startsWith('he-')
        );
        if (hebrewVoice) utterance.voice = hebrewVoice;
        utterance.onerror = () => setErrorMessage(t('chatVoicePlaybackError'));
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
      setErrorMessage(t('chatVoicePlaybackError'));
    }
  }, [t]);

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
    setLoading(true);

    try {
      const response = await sendVoiceMessage({
        audioBlob,
        conversationId,
        level: DEFAULT_CHAT_LEVEL,
        includeArabic,
      });

      setConversationId(response.conversationId);

      const userText = response.transcribedText || t('chatVoiceRecordedMessage');
      setMessages((curr) => [
        ...curr,
        createLocalMessage({
          role: 'user',
          textHe: userText,
        }),
        createLocalMessage({
          role: 'assistant',
          textHe: response.answerHe || t('chatVoiceTranscriptionError'),
          textAr: response.answerAr,
          fallbackUsed: response.fallbackUsed,
          fallbackReason: response.fallbackReason,
        }),
      ]);

      // TTS is handled by the browser — speak the Hebrew answer aloud
      if (response.answerHe && !response.fallbackUsed) {
        playVoiceReply(response.answerHe);
      }

      await refreshConversations();
    } catch (error) {
      presentError(error);
    } finally {
      recorder.clearAudio();
      setLoading(false);
    }
  }, [
    conversationId,
    includeArabic,
    loading,
    playVoiceReply,
    recorder,
    t,
  ]);

  useEffect(() => {
    if (!recorder.audioBlob) return;
    void submitVoiceMessage(recorder.audioBlob);
  }, [recorder.audioBlob, submitVoiceMessage]);

  const handleVoiceToggle = async () => {
    setErrorMessage('');
    recorder.clearError();
    await recorder.toggleRecording();
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_52%,#F8F5FF_100%)] px-4 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="relative mx-auto min-h-[calc(100vh-2.5rem)] max-w-xl pb-28 sm:min-h-[780px]">
        <PageHeader />

        <section className="mt-6 rounded-3xl bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {t('chatHeroBadge')}
              </div>
              <h1 className="mt-3 text-xl font-bold text-slate-950 sm:text-2xl">{t('chatTitle')}</h1>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{t('chatIntro')}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                disabled={loading}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-500"
                aria-label={t('chatHistoryTitle')}
                title={t('chatHistoryTitle')}
              >
                <History className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={resetConversation}
                disabled={loading}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-600 text-white shadow-sm transition hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
                aria-label={t('chatNewConversation')}
                title={t('chatNewConversation')}
              >
                <MessageSquarePlus className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-600">
              <ShieldCheck className="h-3.5 w-3.5 text-violet-600" aria-hidden="true" /> {t('chatTrustOne')}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-600">
              <BotMessageSquare className="h-3.5 w-3.5 text-violet-600" aria-hidden="true" /> {t('chatTrustTwo')}
            </span>
          </div>
        </section>

        {errorMessage ? (
          <section className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
            {errorMessage}
          </section>
        ) : null}

        <section className="chat-page__surface chat-page__surface--premium mt-4">
          <ChatWindow
            messages={messages}
            loading={loading}
            loadingLabel={t('chatThinking')}
            emptyTitle={t('chatEmptyTitle')}
            emptyDescription={t('chatEmptyDescription')}
            emptyPrompts={suggestedPrompts}
            onPromptClick={submitMessage}
          />
        </section>

        <div className="chat-page__composer">
          <ChatComposer
            value={composerValue}
            disabled={loading}
            loading={loading}
            includeArabic={includeArabic}
            onChange={setComposerValue}
            onSubmit={() => submitMessage()}
            onToggleArabic={toggleArabic}
            onVoiceToggle={handleVoiceToggle}
            placeholder={t('chatComposerPlaceholder')}
            sendLabel={t('chatSend')}
            arabicToggleLabel={t('chatIncludeArabic')}
            voiceLabel={t('chatVoiceAction')}
            voiceStatusLabel={voiceStatusLabel}
            voiceState={recorder.status}
            voiceSupported={recorder.isSupported}
          />
        </div>

        {/* ── History Sidebar (responsive drawer) ──────────────────── */}
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

        <BottomNav />
      </div>
    </main>
  );
}

export default ChatbotPage;
