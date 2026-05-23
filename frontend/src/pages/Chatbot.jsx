import React, { useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader.jsx';
import { getStoredToken } from '../services/auth.js';

const API_BASE_URL = 'http://localhost:3000/api';

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

  const hasSetupChat = useRef(false);

  const request = async (path, options = {}) => {
    const token = getStoredToken();

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {}),
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
        const currentChatId =
          searchParams.get('chatId');

        // تحميل chat موجودة
        if (currentChatId) {
          const data = await request(
            `/chats/${currentChatId}`,
          );

          const backendMessages =
            data.chat?.messages || [];

          setChatId(currentChatId);

          if (backendMessages.length > 0) {
            setMessages(
              backendMessages.map(
                mapBackendMessageToUi,
              ),
            );
          }

          return;
        }

        // إنشاء chat جديدة
        const data = await request('/chats', {
          method: 'POST',
          body: JSON.stringify({
            title: title || t('chatbot'),
            level: 'A1',
          }),
        });

        const newChatId = data.chat.id;

        setChatId(newChatId);

        setSearchParams({
          chatId: newChatId,
        });
      } catch (error) {
        console.error(
          'Failed to setup chat:',
          error,
        );
      } finally {
        setLoadingChat(false);
      }
    };

    setupChat();
  }, []);

  const sendMessage = async (event) => {
    event.preventDefault();

    const trimmedInput = input.trim();

    if (
      !trimmedInput ||
      sending ||
      !chatId
    ) {
      return;
    }

    // عرض رسالة المستخدم مباشرة
    const tempUserMessage = {
      id: createMessageId('user'),
      role: 'user',
      text: trimmedInput,
    };

    setMessages((currentMessages) => [
      ...currentMessages,
      tempUserMessage,
    ]);

    setInput('');
    setSending(true);

    try {
      // إرسال الرسالة للـ backend + AI
      const data = await request(
        `/chats/${chatId}/ai-message`,
        {
          method: 'POST',
          body: JSON.stringify({
            text: trimmedInput,
          }),
        },
      );

      // إضافة رد AI الحقيقي
      const aiMessage = {
        id: createMessageId('bot'),
        role: 'bot',
        text:
          data.aiMessage?.text ||
          'אירעה שגיאה ביצירת תשובה.',
      };

      setMessages((currentMessages) => [
        ...currentMessages,
        aiMessage,
      ]);
    } catch (error) {
      console.error(
        'Failed to send AI message:',
        error,
      );

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createMessageId('bot'),
          role: 'bot',
          text: 'אירעה שגיאה בחיבור לשרת.',
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <main
      className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_100%)] px-4 py-5"
      translate="no"
    >
      <div className="mx-auto max-w-2xl">
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

          <div className="mt-5 flex flex-1 flex-col gap-2 overflow-y-auto pb-4">
            {loadingChat ? (
              <div className="self-start rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
                Loading chat...
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                    msg.role === 'user'
                      ? 'self-end bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white'
                      : 'self-start bg-slate-100 text-slate-900'
                  }`}
                >
                  <span>{msg.text}</span>
                </div>
              ))
            )}
          </div>

          <form
            className="mt-auto flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2"
            onSubmit={sendMessage}
          >
            <input
              type="text"
              value={input}
              onChange={(event) =>
                setInput(event.target.value)
              }
              placeholder="Type a message..."
              className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm outline-none"
              disabled={sending}
            />

            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-violet-700 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              aria-label="Microphone"
              title="Microphone"
            >
              <Mic
                className="h-5 w-5"
                aria-hidden="true"
              />
            </button>

            <button
              type="submit"
              disabled={sending}
              className="shrink-0 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {sending ? 'Thinking...' : 'Send'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

export default Chatbot;
