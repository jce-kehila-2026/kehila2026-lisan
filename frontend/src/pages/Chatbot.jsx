import React, { useState } from 'react';
import { Mic } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PageHeader from '../components/PageHeader.jsx';

const createMessageId = (role) =>
  `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function Chatbot({
  title,
  subtitle,
  initialMessage = 'שלום! איך אפשר לעזור לך היום?',
  placeholderResponse = 'מצוין. אפשר להמשיך לתרגל בעברית.',
}) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState(() => [
    {
      id: 'welcome',
      role: 'bot',
      text: initialMessage,
    },
  ]);
  const [input, setInput] = useState('');

  const sendMessage = (event) => {
    event.preventDefault();

    const trimmedInput = input.trim();
    if (!trimmedInput) return;

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: createMessageId('user'),
        role: 'user',
        text: trimmedInput,
      },
      {
        id: createMessageId('bot'),
        role: 'bot',
        text: placeholderResponse,
      },
    ]);
    setInput('');
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
            <h1 className="text-2xl font-bold text-slate-900">{title || t('chatbot')}</h1>
            {subtitle ? (
              <p className="mt-2 text-sm font-semibold text-violet-700">{subtitle}</p>
            ) : null}
          </div>

          <div className="mt-5 flex flex-1 flex-col gap-2 overflow-y-auto pb-4">
            {messages.map((msg) => (
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
            ))}
          </div>

          <form className="mt-auto flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2" onSubmit={sendMessage}>
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Type a message..."
              className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm outline-none"
            />
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-violet-700 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              aria-label="Microphone"
              title="Microphone"
            >
              <Mic className="h-5 w-5" aria-hidden="true" />
            </button>

            <button
              type="submit"
              className="shrink-0 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-bold text-white"
            >
              Send
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

export default Chatbot;
