import React from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Chatbot from './Chatbot.jsx';

const scenarioTitles = {
  'daily-word': 'storyDailyWord',
  letters: 'storyLetters',
  listening: 'storyListening',
  speaking: 'storySpeaking',
  quiz: 'storyQuiz',
  culture: 'storyCulture',
};

function ScenarioChat() {
  const { id } = useParams();
  const { t } = useTranslation();
  const titleKey = scenarioTitles[id];

  return (
    <Chatbot
      title={titleKey ? t(titleKey) : t('story')}
      subtitle="תרגול שיחה לפי הדיאלוג מהספר"
      initialMessage="שלום, מה כואב לך היום?"
      placeholderResponse="אני מבין. בוא נמשיך את השיחה בעברית."
    />
  );
}

export default ScenarioChat;
