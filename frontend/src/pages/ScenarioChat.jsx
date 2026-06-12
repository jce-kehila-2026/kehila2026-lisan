import React from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import Chatbot from './Chatbot.jsx';
import {
  getStudentStoryById,
  getStudentStorySubtitle,
  getStudentStoryTitle,
} from '../data/studentStories.jsx';

const scenarioConfig = {
  'daily-word': {
    titleKey: 'storyDailyWord',
    subtitle: 'תרגול מילים יומי',
    initialMessage: 'שלום! איזו מילה חדשה נתרגל היום?',
    placeholderResponse: 'מצוין. נמשיך לתרגל את המילה במשפטים פשוטים.',
  },
  letters: {
    titleKey: 'storyLetters',
    subtitle: 'תרגול אותיות בעברית',
    initialMessage: 'שלום! איזו אות נתרגל היום?',
    placeholderResponse: 'יפה מאוד. בוא נמשיך לתרגל את האות הזאת.',
  },
  listening: {
    titleKey: 'storyListening',
    subtitle: 'תרגול הבנת הנשמע',
    initialMessage: 'שלום! אני אגיד משפט קצר, ואת תנסי להבין אותו.',
    placeholderResponse: 'מצוין. התשובה שלך מובנת, נמשיך לתרגיל הבא.',
  },
  speaking: {
    titleKey: 'storySpeaking',
    subtitle: 'תרגול דיבור בעברית',
    initialMessage: 'שלום! בואי נתרגל שיחה קצרה בעברית.',
    placeholderResponse: 'יפה מאוד. אפשר להמשיך לדבר בעברית.',
  },
  quiz: {
    titleKey: 'storyQuiz',
    subtitle: 'תרגול שאלות קצרות',
    initialMessage: 'שלום! מוכנה לשאלה קצרה בעברית?',
    placeholderResponse: 'תשובה טובה. נעבור לשאלה הבאה.',
  },
  culture: {
    titleKey: 'storyCulture',
    subtitle: 'תרגול שיחה על תרבות וחיי יום-יום',
    initialMessage: 'שלום! היום נדבר על נושא מהחיים היומיומיים.',
    placeholderResponse: 'מעניין מאוד. בואי נמשיך את השיחה.',
  },
};

function ScenarioChat() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const story = getStudentStoryById(id);

  const scenario = scenarioConfig[id] || {
    titleKey: story ? null : 'story',
    title: story ? getStudentStoryTitle(story, i18n.language) : '',
    subtitle: story
      ? getStudentStorySubtitle(story, i18n.language)
      : 'תרגול שיחה לפי הדיאלוג מהספר',
    initialMessage: story
      ? `שלום! בואי נתרגל שיחה בנושא: ${getStudentStoryTitle(story, 'he')}.`
      : 'שלום! בואי נתרגל שיחה בעברית.',
    placeholderResponse: 'אני מבין. בוא נמשיך את השיחה בעברית.',
  };

  return (
    <Chatbot
      title={scenario.title || t(scenario.titleKey)}
      subtitle={scenario.subtitle}
      initialMessage={scenario.initialMessage}
      placeholderResponse={scenario.placeholderResponse}
      scenario={id}
    />
  );
}

export default ScenarioChat;
