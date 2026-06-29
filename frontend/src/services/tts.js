import { synthesizeSpeech } from './chat.js';

// Browser Web Speech fallback. Speaks Hebrew via speechSynthesis.
// Handles Chromium-on-Linux, which populates voices lazily and may never
// fire 'voiceschanged' — a 250ms timeout guarantees we still attempt to speak.
function speakViaBrowser(text) {
  const spokenText = typeof text === 'string' ? text.trim() : '';
  if (!spokenText || typeof window === 'undefined' || !window.speechSynthesis) {
    return;
  }
  const doSpeak = () => {
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = 'he-IL';
    utterance.rate = 0.85;
    utterance.pitch = 1;
    utterance.volume = 1;
    const voices = window.speechSynthesis.getVoices?.() || [];
    const hebrewVoice =
      voices.find((v) => v.lang === 'he-IL') ||
      voices.find((v) => v.lang === 'he') ||
      voices.find((v) => String(v.lang || '').startsWith('he-')) ||
      null;
    if (hebrewVoice) utterance.voice = hebrewVoice;
    window.speechSynthesis.cancel();
    window.setTimeout(() => window.speechSynthesis.speak(utterance), 50);
  };
  const voices = window.speechSynthesis.getVoices?.() || [];
  if (voices.length > 0) {
    doSpeak();
  } else {
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      doSpeak();
    };
    window.speechSynthesis.addEventListener('voiceschanged', start, { once: true });
    window.setTimeout(start, 250);
  }
}

// Primary: Azure TTS (rich he-IL neural voice). Falls back to the browser
// voice on any failure: thrown error, null audio, or a rejected play promise.
export async function speakHebrew(text) {
  const spokenText = typeof text === 'string' ? text.trim() : '';
  if (!spokenText) return;
  let audioBase64 = null;
  try {
    const result = await synthesizeSpeech({ text: spokenText });
    audioBase64 = result?.audioBase64 ?? null;
  } catch {
    speakViaBrowser(spokenText);
    return;
  }
  if (!audioBase64) {
    speakViaBrowser(spokenText);
    return;
  }
  try {
    const audio = new Audio(`data:audio/mpeg;base64,${audioBase64}`);
    await audio.play();
  } catch {
    speakViaBrowser(spokenText);
  }
}
