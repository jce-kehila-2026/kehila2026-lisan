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
    subtitle: { ar: 'تدريب يومي على الكلمات', he: 'תרגול מילים יומי' },
    initialMessage: {
      ar: 'أهلاً! أي كلمة جديدة سنتدرب عليها اليوم؟',
      he: 'שלום! איזו מילה חדשה נתרגל היום?',
    },
    placeholderResponse: {
      ar: 'ممتاز. سنواصل تدريب الكلمة بجمل بسيطة.',
      he: 'מצוין. נמשיך לתרגל את המילה במשפטים פשוטים.',
    },
  },
  letters: {
    titleKey: 'storyLetters',
    subtitle: { ar: 'تدريب على الأحرف العبرية', he: 'תרגול אותיות בעברית' },
    initialMessage: {
      ar: 'أهلاً! أي حرف سنتدرب عليه اليوم؟',
      he: 'שלום! איזו אות נתרגל היום?',
    },
    placeholderResponse: {
      ar: 'جميل جداً. سنكمل التدريب على هذا الحرف.',
      he: 'יפה מאוד. בוא נמשיך לתרגל את האות הזאת.',
    },
  },
  listening: {
    titleKey: 'storyListening',
    subtitle: { ar: 'تدريب فهم المسموع', he: 'תרגול הבנת הנשמע' },
    initialMessage: {
      ar: 'أهلاً! سأقول جملة قصيرة، وحاولي فهمها.',
      he: 'שלום! אני אגיד משפט קצר, ואת תנסי להבין אותו.',
    },
    placeholderResponse: {
      ar: 'ممتاز. إجابتك واضحة، ننتقل إلى التمرين التالي.',
      he: 'מצוין. התשובה שלך מובנת, נמשיך לתרגיל הבא.',
    },
  },
  speaking: {
    titleKey: 'storySpeaking',
    subtitle: { ar: 'تدريب المحادثة بالعبرية', he: 'תרגול דיבור בעברית' },
    initialMessage: {
      ar: 'أهلاً! هيا نتدرب على محادثة قصيرة بالعبرية.',
      he: 'שלום! בואי נתרגל שיחה קצרה בעברית.',
    },
    placeholderResponse: {
      ar: 'جميل جداً. يمكننا الاستمرار في الحديث بالعبرية.',
      he: 'יפה מאוד. אפשר להמשיך לדבר בעברית.',
    },
  },
  quiz: {
    titleKey: 'storyQuiz',
    subtitle: { ar: 'تدريب أسئلة قصيرة', he: 'תרגול שאלות קצרות' },
    initialMessage: {
      ar: 'أهلاً! هل أنتِ جاهزة لسؤال قصير بالعبرية؟',
      he: 'שלום! מוכנה לשאלה קצרה בעברית?',
    },
    placeholderResponse: {
      ar: 'إجابة جيدة. ننتقل إلى السؤال التالي.',
      he: 'תשובה טובה. נעבור לשאלה הבאה.',
    },
  },
  culture: {
    titleKey: 'storyCulture',
    subtitle: {
      ar: 'تدريب محادثة عن الثقافة والحياة اليومية',
      he: 'תרגול שיחה על תרבות וחיי יום-יום',
    },
    initialMessage: {
      ar: 'أهلاً! سنتحدث اليوم عن موضوع من الحياة اليومية.',
      he: 'שלום! היום נדבר על נושא מהחיים היומיומיים.',
    },
    placeholderResponse: {
      ar: 'مثير للاهتمام. هيا نكمل المحادثة.',
      he: 'מעניין מאוד. בואי נמשיך את השיחה.',
    },
  },
};

function pickLocalized(value, language) {
  if (!value || typeof value !== 'object') return value;
  return value[language] || value.he || value.ar || '';
}

function ScenarioChat() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'he' ? 'he' : 'ar';
  const story = getStudentStoryById(id);

  const scenario = scenarioConfig[id] || {
    titleKey: story ? null : 'story',
    title: story ? getStudentStoryTitle(story, language) : '',
    subtitle: story
      ? getStudentStorySubtitle(story, language)
      : {
          ar: 'تدريب محادثة حسب الحوار من الكتاب',
          he: 'תרגול שיחה לפי הדיאלוג מהספר',
        },
    initialMessage: story
      ? {
          ar: `أهلاً! هيا نتدرب على محادثة بعنوان: ${getStudentStoryTitle(story, 'ar')}.`,
          he: `שלום! בואי נתרגל שיחה בנושא: ${getStudentStoryTitle(story, 'he')}.`,
        }
      : {
          ar: 'أهلاً! هيا نتدرب على محادثة بالعبرية.',
          he: 'שלום! בואי נתרגל שיחה בעברית.',
        },
    placeholderResponse: {
      ar: 'أفهمك. هيا نكمل المحادثة بالعبرية.',
      he: 'אני מבין. בוא נמשיך את השיחה בעברית.',
    },
  };

  return (
    <Chatbot
      title={scenario.title || t(scenario.titleKey)}
      subtitle={pickLocalized(scenario.subtitle, language)}
      initialMessage={pickLocalized(scenario.initialMessage, language)}
      placeholderResponse={pickLocalized(scenario.placeholderResponse, language)}
      scenario={id}
    />
  );
}

export default ScenarioChat;
