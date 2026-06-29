import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Users } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import BottomNav from '../components/BottomNav.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { getStoredToken, getStoredUser } from '../services/auth.js';

const API_BASE_URL = '/api';

const roomText = {
    ar: {
        sharedChat: 'محادثة مشتركة',
        loadError: 'حدث خطأ أثناء تحميل المحادثة.',
        sendError: 'حدث خطأ أثناء إرسال الرسالة.',
        subtitle: 'محادثة بين مستخدمات النظام',
        loading: 'جارٍ تحميل المحادثة...',
        empty: 'لا توجد رسائل بعد.',
        userFallback: 'مستخدمة',
        placeholder: 'اكتبي رسالة...',
    },
    he: {
        sharedChat: 'שיחה משותפת',
        loadError: 'אירעה שגיאה בטעינת השיחה.',
        sendError: 'אירעה שגיאה בשליחת ההודעה.',
        subtitle: 'שיחה בין משתמשי המערכת',
        loading: 'טוען שיחה...',
        empty: 'אין הודעות עדיין.',
        userFallback: 'משתמש',
        placeholder: 'כתבי הודעה...',
    },
};

function formatParticipantNames(chat, currentUserId, text) {
    if (!chat?.participantNames) {
        return text.sharedChat;
    }

    const names = Object.entries(chat.participantNames)
        .filter(([id]) => id !== currentUserId)
        .map(([, name]) => name);

    if (names.length === 0) {
        return text.sharedChat;
    }

    return names.join(', ');
}

function formatMessageTime(value, language) {
    if (!value) {
        return '';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toLocaleTimeString(language === 'he' ? 'he-IL' : 'ar', {
        hour: '2-digit',
        minute: '2-digit',
    });
}

function SharedChatRoom() {
    const { id } = useParams();
    const { i18n } = useTranslation();
    const language = i18n.language === 'he' ? 'he' : 'ar';
    const textLabels = roomText[language];
    const user = getStoredUser();

    const currentUserId = user?.id || user?.uid;

    const messagesEndRef = useRef(null);

    const [chat, setChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');

    const chatNotFoundRef = React.useRef(false);

    const loadChat = async (silent = false) => {
        if (chatNotFoundRef.current) return;
        try {
            if (!silent) {
                setLoading(true);
            }

            const token = getStoredToken();

            const response = await fetch(`${API_BASE_URL}/shared-chats/${id}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 404) {
                    chatNotFoundRef.current = true;
                }
                throw new Error(data.error || 'Failed to load chat');
            }

            setChat(data.chat || null);
            setMessages(data.messages || []);
        } catch (err) {
            console.error('Failed to load shared chat:', err);
            setError(textLabels.loadError);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        chatNotFoundRef.current = false;
        loadChat();
    }, [id]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (!chatNotFoundRef.current) loadChat(true);
        }, 5000);

        return () => clearInterval(interval);
    }, [id]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({
            behavior: 'smooth',
        });
    }, [messages]);

    const chatTitle = useMemo(() => {
        if (!chat) {
            return textLabels.sharedChat;
        }

        return (
            formatParticipantNames(chat, currentUserId, textLabels) ||
            chat.title ||
            textLabels.sharedChat
        );
    }, [chat, currentUserId, textLabels]);

    const sendMessage = async () => {
        if (!text.trim()) {
            return;
        }

        try {
            setSending(true);
            setError('');

            const token = getStoredToken();

            const response = await fetch(`${API_BASE_URL}/shared-chats/${id}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    text,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to send message');
            }

            setMessages((current) => [...current, data.message]);
            setText('');

            loadChat(true);
        } catch (err) {
            console.error('Failed to send message:', err);
            setError(textLabels.sendError);
        } finally {
            setSending(false);
        }
    };

    return (
        <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_52%,#F8F5FF_100%)] px-3 py-4 text-slate-900 sm:px-4 sm:py-6 md:px-6 md:py-8 lg:px-8">
            <div
                className="relative mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[1680px] flex-col pb-32 sm:min-h-[780px]"
                dir="rtl"
            >
                <PageHeader showBack />

                <section className="mt-6 rounded-3xl bg-white p-5 shadow-card sm:p-6">
                    <div className="flex items-center gap-3">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                            <Users className="h-6 w-6" aria-hidden="true" />
                        </span>

                        <div>
                            <h1 className="text-2xl font-black text-slate-950">
                                {chatTitle}
                            </h1>

                            <p className="mt-1 text-sm font-semibold text-slate-500">
                                {textLabels.subtitle}
                            </p>
                        </div>
                    </div>
                </section>

                <section className="mt-5 flex flex-1 flex-col rounded-3xl bg-white p-5 shadow-card sm:p-6">
                    {loading ? (
                        <p className="text-center text-sm font-semibold text-slate-500">
                            {textLabels.loading}
                        </p>
                    ) : error ? (
                        <p className="text-center text-sm font-semibold text-violet-700">
                            {error}
                        </p>
                    ) : messages.length === 0 ? (
                        <p className="text-center text-sm font-semibold text-slate-500">
                            {textLabels.empty}
                        </p>
                    ) : (
                        <div className="flex max-h-[500px] flex-1 flex-col gap-3 overflow-y-auto pr-1">
                            {messages.map((message) => {
                                const isMine =
                                    message.senderId === currentUserId;

                                const senderName =
                                    chat?.participantNames?.[message.senderId] || textLabels.userFallback;

                                return (
                                    <div
                                        key={message.id}
                                    className={`max-w-[92%] rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm transition sm:max-w-[82%] lg:max-w-[68%] ${isMine
                                                ? 'self-end bg-violet-600 text-white'
                                                : 'self-start bg-slate-100 text-slate-800'
                                            }`}
                                    >
                                        {!isMine ? (
                                            <p className="mb-1 text-xs font-black text-violet-700">
                                                {senderName}
                                            </p>
                                        ) : null}

                                        <p>{message.text}</p>

                                        <p
                                            className={`mt-2 text-[11px] font-bold ${isMine
                                                    ? 'text-violet-100'
                                                    : 'text-slate-400'
                                                }`}
                                        >
                                            {formatMessageTime(message.createdAt, language)}
                                        </p>
                                    </div>
                                );
                            })}

                            <div ref={messagesEndRef} />
                        </div>
                    )}

                    <div className="mt-5 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
                        <input
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                            placeholder={textLabels.placeholder}
                            className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    sendMessage();
                                }
                            }}
                        />

                        <button
                            type="button"
                            onClick={sendMessage}
                            disabled={sending || !text.trim()}
                            className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-600 text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                            <Send className="h-5 w-5" aria-hidden="true" />
                        </button>
                    </div>
                </section>

                <BottomNav />
            </div>
        </main>
    );
}

export default SharedChatRoom;
