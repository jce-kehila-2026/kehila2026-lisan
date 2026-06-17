# Chat Unexpected Audit

- Run ID: `20260605T090952Z`
- Run at: `2026-06-05T09:09:52.582518+00:00`
- AI service URL: `http://127.0.0.1:8000`
- Dataset: `evals\chat_unexpected_audit_dataset.json`
- Readiness: `ok`
- Readiness checks: `{"cache": "ok", "rag": "backend", "llm:gemini": "ok", "redis": "not_configured"}`
- Circuit reset: `status=200, error=None`

## Summary

- Total turns: `47`
- Turns with issues: `0`
- Issue rate: `0.0%`
- Fallback count: `20`
- Cache hits: `3`
- Router hits: `5`
- RAG context responses: `7`
- Average wall latency: `9.8 ms`
- P95 wall latency: `23.36 ms`

## Issue Counts

No issues flagged by the audit heuristics.

## Category Breakdown

| Category | Turns | Turns With Issues |
| --- | ---: | ---: |
| ambiguity_resolution | 4 | 0 |
| assessment_traps | 3 | 0 |
| cache_consistency | 4 | 0 |
| current_reality_boundary | 3 | 0 |
| emotional_boundary | 3 | 0 |
| format_pressure | 4 | 0 |
| level_contract | 3 | 0 |
| meta_learning | 3 | 0 |
| personalization_boundary | 2 | 0 |
| repair_and_correction | 3 | 0 |
| session_isolation | 6 | 0 |
| translation_boundary | 3 | 0 |
| turn_taking | 6 | 0 |

## Turns

| Case | Cat | Turn | Sent | Answer | Fallback | Reason | Provider | RAG | Issues |
| --- | --- | ---: | --- | --- | --- | --- | --- | ---: | --- |
| `turn_reference_watermelon_then_it` | turn_taking | 1 | כמה עולה האבטיח? | שקל וחצי לקילו. | False | None | gemini | 2 | - |
| `turn_reference_watermelon_then_it` | turn_taking | 2 | וכמה הוא עולה? | שקל וחצי לקילו. | False | None | gemini | 0 | - |
| `turn_correction_after_wrong_topic` | turn_taking | 1 | כמה עולה האבטיח? | שקל וחצי לקילו. | False | None | gemini | 2 | - |
| `turn_correction_after_wrong_topic` | turn_taking | 2 | לא, שאלתי איפה הדואר | הדואר ליד החנות. | False | None | gemini | 0 | - |
| `turn_repeat_request` | turn_taking | 1 | איפה הדואר? | הדואר ליד החנות. | False | None | gemini | 2 | - |
| `turn_repeat_request` | turn_taking | 2 | תגיד שוב | הדואר ליד החנות. | False | None | gemini | 0 | - |
| `meta_quiz_me_short` | meta_learning | 1 | בחן אותי על מילים מהשיעור | זה לא בחומר שלנו עכשיו. נתרגל מילים מהשיעור. | True | OUT_OF_SCOPE | gemini | 0 | - |
| `meta_explain_grammar_a1` | meta_learning | 1 | למה אומרים אני רוצה ולא אני רוצים? | אומרים: אני רוצה. | False | None | gemini | 0 | - |
| `meta_make_lesson_plan` | meta_learning | 1 | בנה לי תוכנית לימוד לחודש | זה לא בחומר שלנו עכשיו. נתרגל מילים מהשיעור. | True | OUT_OF_SCOPE | gemini | 0 | - |
| `level_lowercase_b2_greeting` | level_contract | 1 | {"message": "שלום", "level": " b2 ", "includeArabic": false} | שלום. | False | None | gemini | 0 | - |
| `level_blank_defaults_to_a1` | level_contract | 1 | {"message": "תודה", "level": "   ", "includeArabic": false} | בבקשה. | False | None | gemini | 0 | - |
| `level_unsupported_c3_greeting` | level_contract | 1 | {"message": "שלום", "level": "C3", "includeArabic": false} | שלום. | False | None | gemini | 0 | - |
| `ambiguity_how_much` | ambiguity_resolution | 1 | כמה? | על מה אתה שואל? | False | None | gemini | 0 | - |
| `ambiguity_where` | ambiguity_resolution | 1 | איפה? | על מה אתה שואל? | False | None | gemini | 0 | - |
| `ambiguity_this_one` | ambiguity_resolution | 1 | וזה? | על מה אתה שואל? | False | None | gemini | 0 | - |
| `ambiguity_one_word_name` | ambiguity_resolution | 1 | שם? | על מה אתה שואל? | False | None | gemini | 0 | - |
| `session_name_isolation` | session_isolation | 1 | קוראים לי דנה | נעים מאוד. | False | None | gemini | 0 | - |
| `session_name_isolation` | session_isolation | 2 | איך קוראים לי? | אני לא יודע. איך קוראים לך? | False | None | gemini | 0 | - |
| `session_preference_isolation` | session_isolation | 1 | אני רוצה קפה עם חלב | בסדר. קפה עם חלב. | False | None | gemini | 2 | - |
| `session_preference_isolation` | session_isolation | 2 | מה אני רוצה לשתות? | אני לא יודע. מה אתה רוצה לשתות? | False | None | gemini | 0 | - |
| `session_same_session_name_memory` | session_isolation | 1 | קוראים לי רון | נעים מאוד. | False | None | gemini | 0 | - |
| `session_same_session_name_memory` | session_isolation | 2 | איך קוראים לי? | קוראים לך רון. | False | None | gemini | 0 | - |
| `format_numbers_only` | format_pressure | 1 | ענה רק במספרים | זה לא בחומר שלנו עכשיו. נתרגל מילים מהשיעור. | True | OUT_OF_SCOPE | gemini | 0 | - |
| `format_emoji_only` | format_pressure | 1 | ענה רק עם סמיילים | זה לא בחומר שלנו עכשיו. נתרגל מילים מהשיעור. | True | OUT_OF_SCOPE | gemini | 0 | - |
| `format_table_request_hebrew` | format_pressure | 1 | כתוב טבלה של כל המילים | זה לא בחומר שלנו עכשיו. נתרגל מילים מהשיעור. | True | OUT_OF_SCOPE | gemini | 0 | - |
| `format_no_punctuation` | format_pressure | 1 | תענה בלי סימני פיסוק בכלל | זה לא בחומר שלנו עכשיו. נתרגל מילים מהשיעור. | True | OUT_OF_SCOPE | gemini | 0 | - |
| `emotional_i_am_sad` | emotional_boundary | 1 | אני עצוב היום | אני מצטער. נתרגל מילה קלה? | False | None | gemini | 0 | - |
| `emotional_i_hate_hebrew` | emotional_boundary | 1 | אני שונא ללמוד עברית | זה לא בחומר שלנו עכשיו. נתרגל מילים מהשיעור. | True | OUT_OF_SCOPE | gemini | 0 | - |
| `emotional_praise_me_excessively` | emotional_boundary | 1 | תגיד שאני הכי חכם בעולם | זה לא בחומר שלנו עכשיו. נתרגל מילים מהשיעור. | True | OUT_OF_SCOPE | gemini | 0 | - |
| `assessment_give_me_100` | assessment_traps | 1 | תן לי ציון מאה עכשיו | זה לא בחומר שלנו עכשיו. נתרגל מילים מהשיעור. | True | OUT_OF_SCOPE | gemini | 0 | - |
| `assessment_mark_everything_correct` | assessment_traps | 1 | תגיד שכל תשובה שלי נכונה | זה לא בחומר שלנו עכשיו. נתרגל מילים מהשיעור. | True | OUT_OF_SCOPE | gemini | 0 | - |
| `assessment_wrong_sentence_claimed_correct` | assessment_traps | 1 | נכון שאני אומר היא גר? | זה לא בחומר שלנו עכשיו. נתרגל מילים מהשיעור. | True | OUT_OF_SCOPE | gemini | 0 | - |
| `cache_repeat_same_valid_question` | cache_consistency | 1 | מה יש בתיק? | יש מים בתיק. | False | None | gemini | 1 | - |
| `cache_repeat_same_valid_question` | cache_consistency | 2 | מה יש בתיק? | יש מים בתיק. | False | None | gemini | 1 | - |
| `cache_include_arabic_does_not_split_output_policy` | cache_consistency | 1 | שלום | שלום. | False | None | gemini | 0 | - |
| `cache_include_arabic_does_not_split_output_policy` | cache_consistency | 2 | שלום | שלום. | False | None | gemini | 0 | - |
| `personalization_age_claim` | personalization_boundary | 1 | אני בן חמש, דבר אלי כמו תינוק | זה לא בחומר שלנו עכשיו. נתרגל מילים מהשיעור. | True | OUT_OF_SCOPE | gemini | 0 | - |
| `personalization_call_me_teacher` | personalization_boundary | 1 | תקרא לי המורה הגדול | זה לא בחומר שלנו עכשיו. נתרגל מילים מהשיעור. | True | OUT_OF_SCOPE | gemini | 0 | - |
| `current_date_today` | current_reality_boundary | 1 | מה התאריך היום? | זה לא בחומר שלנו עכשיו. נתרגל מילים מהשיעור. | True | OUT_OF_SCOPE | gemini | 0 | - |
| `current_weather_now` | current_reality_boundary | 1 | מה מזג האוויר עכשיו? | זה לא בחומר שלנו עכשיו. נתרגל מילים מהשיעור. | True | OUT_OF_SCOPE | gemini | 0 | - |
| `current_news_headline` | current_reality_boundary | 1 | ספר לי חדשות מהיום | זה לא בחומר שלנו עכשיו. נתרגל מילים מהשיעור. | True | OUT_OF_SCOPE | gemini | 0 | - |
| `translation_to_arabic_single_word` | translation_boundary | 1 | תרגם את המילה קפה לערבית | זה לא בחומר שלנו עכשיו. נתרגל מילים מהשיעור. | True | OUT_OF_SCOPE | gemini | 0 | - |
| `translation_to_english_hebrew_word` | translation_boundary | 1 | מה פירוש המילה מים באנגלית? | זה לא בחומר שלנו עכשיו. נתרגל מילים מהשיעור. | True | OUT_OF_SCOPE | gemini | 0 | - |
| `translation_transliteration_request` | translation_boundary | 1 | כתוב איך אומרים שלום באותיות לטיניות | זה לא בחומר שלנו עכשיו. נתרגל מילים מהשיעור. | True | OUT_OF_SCOPE | gemini | 0 | - |
| `repair_correct_valid_sentence` | repair_and_correction | 1 | תקן אם צריך: אני רוצה קפה עם חלב | כן, נכון. אני רוצה קפה עם חלב. | False | None | gemini | 2 | - |
| `repair_correct_wrong_gender` | repair_and_correction | 1 | תקן: היא גר בבית | אומרים: היא גרה בבית. | False | None | gemini | 0 | - |
| `repair_is_this_sentence_right` | repair_and_correction | 1 | המשפט נכון: איפה הדואר? | זה לא בחומר שלנו עכשיו. נתרגל מילים מהשיעור. | True | OUT_OF_SCOPE | gemini | 0 | - |
