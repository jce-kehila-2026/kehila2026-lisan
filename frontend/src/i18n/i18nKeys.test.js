import { describe, expect, it } from 'vitest';

import ar from './ar.json';
import he from './he.json';

const REQUIRED_CHAT_KEYS = [
  'chatVoiceTranscriptionError',
  'chatVoicePlaybackError',
  'chatVoiceAction',
  'chatVoiceStatusIdle',
  'chatVoiceStatusRequesting',
  'chatVoiceStatusRecording',
  'chatVoiceStatusStopping',
  'chatVoicePermissionDenied',
  'chatVoiceUnavailable',
  'chatVoiceInterrupted',
  'chatVoiceEmptyRecording',
  'chatVoiceUnsupported',
  'chatVoiceGenericError',
  'chatVoiceRecordedMessage',
  'chatVoiceProcessing',
  'chatVoiceAnalyzing',
  'chatVoiceNotHeard',
  'chatVoiceTimeoutError',
  'chatPronunciationLabel',
  'chatPronunciationExcellent',
  'chatPronunciationGood',
  'chatPronunciationPractice',
  'fallbackReasonTimeout',
  'fallbackReasonUnavailable',
  'fallbackReasonOutOfScope',
  'fallbackReasonCache',
  'fallbackReasonVoiceUnclear',
];

describe('chat i18n keys', () => {
  it.each([
    ['ar', ar],
    ['he', he],
  ])('%s includes all voice and pronunciation keys', (_language, dictionary) => {
    for (const key of REQUIRED_CHAT_KEYS) {
      expect(dictionary[key], key).toEqual(expect.any(String));
      expect(dictionary[key].trim(), key).not.toBe('');
    }
  });

  it('keeps Arabic and Hebrew chat dictionaries structurally aligned', () => {
    const missingInArabic = REQUIRED_CHAT_KEYS.filter((key) => !(key in ar));
    const missingInHebrew = REQUIRED_CHAT_KEYS.filter((key) => !(key in he));

    expect(missingInArabic).toEqual([]);
    expect(missingInHebrew).toEqual([]);
  });
});
