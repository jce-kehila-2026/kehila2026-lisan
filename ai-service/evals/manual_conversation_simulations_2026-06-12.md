# Manual 20 Conversation Simulation - AI Service

- Generated: 2026-06-12T16:00:18
- Method: direct POST to `/api/ai/chat`, 20 unique `sessionId`s, 10 sequential messages each.
- Persona: Arabic-speaking student practicing Hebrew with a tutor in everyday-life situations.
- Summary: total=200, local=200, llm=0, cache=0, fallback=0, provider_quota=0, unknown=0, request_error=0.


## 1. Gas station (`gas_station`)

- Session ID: `manual-sim-01-gas_station-1781269218`

| # | Student message | Bot response | Expected | Source/diagnosis | Notes |
|---:|---|---|---|---|---|
| 1 | בוא נעשה שיחה בקזיה | אנחנו בקזיה. אני המוכר. כמה דלק אתה צריך? | Expected tutor to start a practical role-play for this setting. | `local/router` | OK |
| 2 | בנזין | יופי, בנזין. כמה דלק אתה צריך? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 3 | בנזין זה דלק | יפה. בנזין זה נכון. כמה דלק אתה צריך? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 4 | כמה זה עולה | אפשר לשאול: כמה זה עולה? כמה דלק אתה צריך? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 5 | אני רוצה מים | יפה. אמרת משפט עם מים. נשארים בקזיה. כמה דלק אתה צריך? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 6 | איפה הקופה | אפשר לשאול: איפה הקופה? כמה דלק אתה צריך? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 7 | תודה | בבקשה. נשארים בקזיה. כמה דלק אתה צריך? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |
| 8 | אני משלם בכרטיס | יפה. אמרת משפט עם בכרטיס. נשארים בקזיה. כמה דלק אתה צריך? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 9 | קפה זה משקה | יפה. קפה זה נכון. כמה דלק אתה צריך? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 10 | יאללה | יאללה. נשארים בקזיה. כמה דלק אתה צריך? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |

## 2. Supermarket (`supermarket`)

- Session ID: `manual-sim-02-supermarket-1781269219`

| # | Student message | Bot response | Expected | Source/diagnosis | Notes |
|---:|---|---|---|---|---|
| 1 | בוא נעשה שיחה בסופר | אנחנו בסופר. אני המוכר. מה אתה רוצה לקנות? | Expected tutor to start a practical role-play for this setting. | `local/router` | OK |
| 2 | חלב | יופי, חלב. מה אתה רוצה לקנות? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 3 | חלב זה משקה לבן | יפה. חלב זה נכון. מה אתה רוצה לקנות? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 4 | אני רוצה לחם | יפה. אמרת משפט עם לחם. נשארים בסופר. מה אתה רוצה לקנות? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 5 | כמה עולה חלב | אפשר לשאול: כמה זה עולה? מה אתה רוצה לקנות? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 6 | יש בננה | יפה. אמרת משפט עם בננה. נשארים בסופר. מה אתה רוצה לקנות? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 7 | בננה זה פרי | יפה. בננה זה נכון. מה אתה רוצה לקנות? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 8 | איפה הקופה | אפשר לשאול: איפה הקופה? מה אתה רוצה לקנות? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 9 | בסדר | בסדר. נשארים בסופר. מה אתה רוצה לקנות? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |
| 10 | תני לי משפט קצר לתרגל | משפט קצר: אני צריך עזרה. עכשיו תענה: מה אתה רוצה לקנות? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |

## 3. Clinic (`clinic`)

- Session ID: `manual-sim-03-clinic-1781269219`

| # | Student message | Bot response | Expected | Source/diagnosis | Notes |
|---:|---|---|---|---|---|
| 1 | שיחה עם דוקטור | אנחנו במרפאה. נתרגל בריאות. מה כואב לך? | Expected tutor to start a practical role-play for this setting. | `local/router` | OK |
| 2 | רופא | יופי, רופא. מה כואב לך? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 3 | מה זה רופא | רופא: רופא מטפל באנשים חולים. לדוגמה: רופא טוב. תוכל לכתוב משפט עם רופא? מה כואב לך? | Expected meaning if known, otherwise no hallucination and a practice prompt. | `local/router` | OK |
| 4 | אני חולה | יפה. אמרת משפט עם חולה. נשארים במרפאה. מה כואב לך? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 5 | כואב לי הראש | יפה. אמרת משפט עם הראש. נשארים במרפאה. מה כואב לך? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 6 | יש לי תור | יפה. אמרת משפט עם תור. נשארים במרפאה. מה כואב לך? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 7 | מרפאה זה מקום | יפה. מרפאה זה נכון. מה כואב לך? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 8 | לא יודע | לא נורא. נשארים במרפאה. מה כואב לך? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |
| 9 | למה | כי אנחנו מתרגלים עברית מהחיים. נשארים במרפאה. מה כואב לך? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |
| 10 | תודה | בבקשה. נשארים במרפאה. מה כואב לך? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |

## 4. University (`university`)

- Session ID: `manual-sim-04-university-1781269220`

| # | Student message | Bot response | Expected | Source/diagnosis | Notes |
|---:|---|---|---|---|---|
| 1 | בוא נלמד באוניברסיטה | אנחנו באוניברסיטה. אני המורה. איזה שיעור יש לך? | Expected tutor to start a practical role-play for this setting. | `local/router` | OK |
| 2 | כיתה | יופי, כיתה. איזה שיעור יש לך? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 3 | כיתה זה מקום | יפה. כיתה זה נכון. איזה שיעור יש לך? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 4 | אני סטודנט | יפה. אמרת משפט עם סטודנט. נשארים באוניברסיטה. איזה שיעור יש לך? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 5 | איפה הכיתה | אפשר לשאול: איפה הכיתה? איזה שיעור יש לך? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 6 | שיעור | אנחנו באוניברסיטה. אני המורה. איזה שיעור יש לך? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 7 | שיעור זה לימוד | אנחנו באוניברסיטה. אני המורה. איזה שיעור יש לך? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 8 | אני לומד עברית | יפה. אמרת משפט עם עברית. נשארים באוניברסיטה. איזה שיעור יש לך? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 9 | בסדר | בסדר. נשארים באוניברסיטה. איזה שיעור יש לך? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |
| 10 | תן משפט קצר | משפט קצר: אני צריך עזרה. עכשיו תענה: איזה שיעור יש לך? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |

## 5. Bus station (`bus_station`)

- Session ID: `manual-sim-05-bus_station-1781269220`

| # | Student message | Bot response | Expected | Source/diagnosis | Notes |
|---:|---|---|---|---|---|
| 1 | שיחה בתחנה | אנחנו בתחנה. אני הנהג. לאן אתה נוסע? | Expected tutor to start a practical role-play for this setting. | `local/router` | OK |
| 2 | אוטובוס | יופי, אוטובוס. לאן אתה נוסע? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 3 | מה זה אוטובוס | אוטובוס: אוטובוס הוא כלי תחבורה ציבורית. לדוגמה: אוטובוס טוב. תוכל לכתוב משפט עם אוטובוס? לאן אתה נוסע? | Expected meaning if known, otherwise no hallucination and a practice prompt. | `local/router` | OK |
| 4 | אני נוסע לירושלים | יפה. אמרת משפט עם לירושלים. נשארים בתחנה. לאן אתה נוסע? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 5 | איפה התחנה | אפשר לשאול: איפה התחנה? לאן אתה נוסע? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 6 | כרטיס | יופי, כרטיס. לאן אתה נוסע? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 7 | כרטיס זה דבר | יפה. כרטיס זה נכון. לאן אתה נוסע? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 8 | כמה זה עולה | אפשר לשאול: כמה זה עולה? לאן אתה נוסע? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 9 | תודה רבה | בבקשה. נשארים בתחנה. לאן אתה נוסע? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |
| 10 | יאללה | יאללה. נשארים בתחנה. לאן אתה נוסע? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |

## 6. Cafe (`cafe`)

- Session ID: `manual-sim-06-cafe-1781269221`

| # | Student message | Bot response | Expected | Source/diagnosis | Notes |
|---:|---|---|---|---|---|
| 1 | בוא נעשה שיחה בבית קפה | אנחנו בבית קפה. אני המלצר. מה אתה רוצה לשתות? | Expected tutor to start a practical role-play for this setting. | `local/router` | OK |
| 2 | קפה | יופי, קפה. מה אתה רוצה לשתות? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 3 | מה זה קפה | קפה: קפה הוא משקה. לדוגמה: קפה טוב. תוכל לכתוב משפט עם קפה? מה אתה רוצה לשתות? | Expected meaning if known, otherwise no hallucination and a practice prompt. | `local/router` | OK |
| 4 | אני רוצה קפה | יפה. אמרת משפט עם קפה. נשארים בבית קפה. מה אתה רוצה לשתות? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 5 | חלב | יופי, חלב. מה אתה רוצה לשתות? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 6 | קפה עם חלב | יפה. אמרת משפט עם חלב. נשארים בבית קפה. מה אתה רוצה לשתות? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 7 | זה טעים | יפה. אמרת משפט עם טעים. נשארים בבית קפה. מה אתה רוצה לשתות? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 8 | אני משלם | יפה. אמרת משפט עם משלם. נשארים בבית קפה. מה אתה רוצה לשתות? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 9 | תודה | בבקשה. נשארים בבית קפה. מה אתה רוצה לשתות? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |
| 10 | עוד משפט | יפה. אמרת משפט עם משפט. נשארים בבית קפה. מה אתה רוצה לשתות? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |

## 7. Bank (`bank`)

- Session ID: `manual-sim-07-bank-1781269221`

| # | Student message | Bot response | Expected | Source/diagnosis | Notes |
|---:|---|---|---|---|---|
| 1 | שיחה בבנק | אנחנו בבנק. אני הפקיד. איזה שירות אתה צריך? | Expected tutor to start a practical role-play for this setting. | `local/router` | OK |
| 2 | בנק | יופי, בנק. איזה שירות אתה צריך? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 3 | מה זה חשבון | חשבון: חשבון יכול להיות תשלום או חשבון בבנק. לדוגמה: חשבון טוב. תוכל לכתוב משפט עם חשבון? איזה שירות אתה צריך? | Expected meaning if known, otherwise no hallucination and a practice prompt. | `local/router` | OK |
| 4 | חשבון זה כסף | יפה. חשבון זה נכון. איזה שירות אתה צריך? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 5 | אני רוצה לפתוח חשבון | יפה. אמרת משפט עם חשבון. נשארים בבנק. איזה שירות אתה צריך? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 6 | טופס | יופי, טופס. איזה שירות אתה צריך? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 7 | טופס זה דף | יפה. טופס זה נכון. איזה שירות אתה צריך? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 8 | חתימה | יופי, חתימה. איזה שירות אתה צריך? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 9 | לא יודע | לא נורא. נשארים בבנק. איזה שירות אתה צריך? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |
| 10 | תודה | בבקשה. נשארים בבנק. איזה שירות אתה צריך? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |

## 8. Post office (`post_office`)

- Session ID: `manual-sim-08-post_office-1781269222`

| # | Student message | Bot response | Expected | Source/diagnosis | Notes |
|---:|---|---|---|---|---|
| 1 | שיחה בדואר | אנחנו בדואר. אני הפקיד. מה אתה רוצה לשלוח? | Expected tutor to start a practical role-play for this setting. | `local/router` | OK |
| 2 | דואר | יופי, דואר. מה אתה רוצה לשלוח? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 3 | איפה הדואר | אפשר לשאול: איפה הדואר? מה אתה רוצה לשלוח? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 4 | מעטפה | יופי, מעטפה. מה אתה רוצה לשלוח? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 5 | מעטפה זה נייר | יפה. מעטפה זה נכון. מה אתה רוצה לשלוח? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 6 | אני שולח מכתב | יפה. אמרת משפט עם מכתב. נשארים בדואר. מה אתה רוצה לשלוח? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 7 | כמה זה עולה | אפשר לשאול: כמה זה עולה? מה אתה רוצה לשלוח? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 8 | בול | יופי, בול. מה אתה רוצה לשלוח? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 9 | בול זה דבר קטן | יפה. בול זה נכון. מה אתה רוצה לשלוח? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 10 | תודה | בבקשה. נשארים בדואר. מה אתה רוצה לשלוח? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |

## 9. Apartment (`apartment`)

- Session ID: `manual-sim-09-apartment-1781269222`

| # | Student message | Bot response | Expected | Source/diagnosis | Notes |
|---:|---|---|---|---|---|
| 1 | שיחה על דירה | אנחנו בדירה. אני השכן. מה יש בבית? | Expected tutor to start a practical role-play for this setting. | `local/router` | OK |
| 2 | בית | יופי, בית. מה יש בבית? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 3 | מה זה בית | בית: בית הוא מקום שגרים בו. לדוגמה: בית טוב. תוכל לכתוב משפט עם בית? מה יש בבית? | Expected meaning if known, otherwise no hallucination and a practice prompt. | `local/router` | OK |
| 4 | אני גר בבית | יפה. אתה גר בבית. מה יש בבית? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 5 | חדר | יופי, חדר. מה יש בבית? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 6 | חדר זה מקום | יפה. חדר זה נכון. מה יש בבית? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 7 | מטבח | יופי, מטבח. מה יש בבית? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 8 | יש מים בבית | יפה. אמרת משפט עם בבית. נשארים בדירה. מה יש בבית? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 9 | בבית | יופי, בבית. מה יש בבית? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 10 | בסדר | בסדר. נשארים בדירה. מה יש בבית? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |

## 10. Phone store (`phone_store`)

- Session ID: `manual-sim-10-phone_store-1781269222`

| # | Student message | Bot response | Expected | Source/diagnosis | Notes |
|---:|---|---|---|---|---|
| 1 | שיחה בחנות טלפונים | אנחנו בחנות טלפונים. אני המוכר. איזה טלפון אתה רוצה? | Expected tutor to start a practical role-play for this setting. | `local/router` | OK |
| 2 | טלפון | יופי, טלפון. איזה טלפון אתה רוצה? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 3 | טלפון זה דבר | יפה. טלפון זה נכון. איזה טלפון אתה רוצה? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 4 | אני רוצה טלפון חדש | יפה. אמרת משפט עם חדש. נשארים בחנות טלפונים. איזה טלפון אתה רוצה? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 5 | כמה זה עולה | אפשר לשאול: כמה זה עולה? איזה טלפון אתה רוצה? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 6 | מטען | יופי, מטען. איזה טלפון אתה רוצה? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 7 | מטען זה דבר | יפה. מטען זה נכון. איזה טלפון אתה רוצה? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 8 | יש אחריות | יפה. אמרת משפט עם אחריות. נשארים בחנות טלפונים. איזה טלפון אתה רוצה? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 9 | לא יודע | לא נורא. נשארים בחנות טלפונים. איזה טלפון אתה רוצה? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |
| 10 | תודה | בבקשה. נשארים בחנות טלפונים. איזה טלפון אתה רוצה? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |

## 11. Bakery (`bakery`)

- Session ID: `manual-sim-11-bakery-1781269223`

| # | Student message | Bot response | Expected | Source/diagnosis | Notes |
|---:|---|---|---|---|---|
| 1 | שיחה במאפייה | אנחנו במאפייה. אני המוכר. מה אתה רוצה לקנות? | Expected tutor to start a practical role-play for this setting. | `local/router` | OK |
| 2 | לחם | יופי, לחם. מה אתה רוצה לקנות? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 3 | מה זה לחם | לחם: לחם הוא אוכל בסיסי. לדוגמה: לחם טוב. תוכל לכתוב משפט עם לחם? מה אתה רוצה לקנות? | Expected meaning if known, otherwise no hallucination and a practice prompt. | `local/router` | OK |
| 4 | אני רוצה לחם | יפה. אמרת משפט עם לחם. נשארים במאפייה. מה אתה רוצה לקנות? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 5 | עוגה | יופי, עוגה. מה אתה רוצה לקנות? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 6 | עוגה זה אוכל | יפה. עוגה זה נכון. מה אתה רוצה לקנות? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 7 | כמה עולה עוגה | אפשר לשאול: כמה זה עולה? מה אתה רוצה לקנות? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 8 | טרי | יופי, טרי. מה אתה רוצה לקנות? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 9 | טרי זה טוב | יפה. טרי זה נכון. מה אתה רוצה לקנות? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 10 | תודה | בבקשה. נשארים במאפייה. מה אתה רוצה לקנות? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |

## 12. Restaurant (`restaurant`)

- Session ID: `manual-sim-12-restaurant-1781269223`

| # | Student message | Bot response | Expected | Source/diagnosis | Notes |
|---:|---|---|---|---|---|
| 1 | בוא נעשה שיחה במסעדה | אנחנו במסעדה. אני המלצר. מה אתה רוצה להזמין? | Expected tutor to start a practical role-play for this setting. | `local/router` | OK |
| 2 | תפריט | יופי, תפריט. מה אתה רוצה להזמין? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 3 | תפריט זה דף | יפה. תפריט זה נכון. מה אתה רוצה להזמין? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 4 | אני רוצה סלט | יפה. אמרת משפט עם סלט. נשארים במסעדה. מה אתה רוצה להזמין? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 5 | מים | יופי, מים. מה אתה רוצה להזמין? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 6 | אני רוצה מים | יפה. אמרת משפט עם מים. נשארים במסעדה. מה אתה רוצה להזמין? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 7 | כמה זה עולה | אפשר לשאול: כמה זה עולה? מה אתה רוצה להזמין? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 8 | טעים | יופי, טעים. מה אתה רוצה להזמין? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 9 | האוכל טעים | יפה. אמרת משפט עם טעים. נשארים במסעדה. מה אתה רוצה להזמין? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 10 | תודה | בבקשה. נשארים במסעדה. מה אתה רוצה להזמין? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |

## 13. Pharmacy (`pharmacy`)

- Session ID: `manual-sim-13-pharmacy-1781269224`

| # | Student message | Bot response | Expected | Source/diagnosis | Notes |
|---:|---|---|---|---|---|
| 1 | שיחה בבית מרקחת | אנחנו בדירה. אני השכן. מה יש בבית? | Expected tutor to start a practical role-play for this setting. | `local/router` | OK |
| 2 | תרופה | יופי, תרופה. מה יש בבית? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 3 | מה זה תרופה | תרופה זו מילה בשיחה שלנו. תכתוב משפט קצר עם תרופה? | Expected meaning if known, otherwise no hallucination and a practice prompt. | `local/router` | OK |
| 4 | אני צריך תרופה | יפה. אמרת משפט עם תרופה. נשארים בדירה. מה יש בבית? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 5 | רופא אמר לי | יפה. אמרת משפט עם לי. נשארים בדירה. מה יש בבית? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 6 | מרשם | יופי, מרשם. מה יש בבית? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 7 | מרשם זה דף | יפה. מרשם זה נכון. מה יש בבית? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 8 | כמה זה עולה | אפשר לשאול: כמה זה עולה? מה יש בבית? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 9 | בסדר | בסדר. נשארים בדירה. מה יש בבית? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |
| 10 | תודה | בבקשה. נשארים בדירה. מה יש בבית? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |

## 14. Hotel (`hotel`)

- Session ID: `manual-sim-14-hotel-1781269224`

| # | Student message | Bot response | Expected | Source/diagnosis | Notes |
|---:|---|---|---|---|---|
| 1 | שיחה במלון | אנחנו במלון. אני הפקיד. איזה חדר אתה צריך? | Expected tutor to start a practical role-play for this setting. | `local/router` | OK |
| 2 | חדר | יופי, חדר. איזה חדר אתה צריך? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 3 | מה זה חדר | חדר זו מילה בשיחה שלנו. תכתוב משפט קצר עם חדר? | Expected meaning if known, otherwise no hallucination and a practice prompt. | `local/router` | OK |
| 4 | אני רוצה חדר | יפה. אמרת משפט עם חדר. נשארים במלון. איזה חדר אתה צריך? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 5 | לילה | יופי, לילה. איזה חדר אתה צריך? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 6 | לילה זה זמן | יפה. לילה זה נכון. איזה חדר אתה צריך? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 7 | מפתח | יופי, מפתח. איזה חדר אתה צריך? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 8 | מפתח זה דבר | יפה. מפתח זה נכון. איזה חדר אתה צריך? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 9 | איפה המעלית | אפשר לשאול: איפה המעלית? איזה חדר אתה צריך? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 10 | תודה | בבקשה. נשארים במלון. איזה חדר אתה צריך? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |

## 15. Market (`market`)

- Session ID: `manual-sim-15-market-1781269224`

| # | Student message | Bot response | Expected | Source/diagnosis | Notes |
|---:|---|---|---|---|---|
| 1 | שיחה בשוק | אנחנו בשוק. אני המוכר. מה אתה רוצה לקנות? | Expected tutor to start a practical role-play for this setting. | `local/router` | OK |
| 2 | עגבניה | יופי, עגבניה. מה אתה רוצה לקנות? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 3 | עגבניה זה אוכל | יפה. עגבניה זה נכון. מה אתה רוצה לקנות? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 4 | אני רוצה קילו | יפה. אמרת משפט עם קילו. נשארים בשוק. מה אתה רוצה לקנות? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 5 | כמה עולה | אפשר לשאול: כמה זה עולה? מה אתה רוצה לקנות? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 6 | יקר | יופי, יקר. מה אתה רוצה לקנות? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 7 | זה יקר | יפה. אמרת משפט עם יקר. נשארים בשוק. מה אתה רוצה לקנות? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 8 | בננה | יופי, בננה. מה אתה רוצה לקנות? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 9 | בננה זה פרי | יפה. בננה זה נכון. מה אתה רוצה לקנות? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 10 | תודה | בבקשה. נשארים בשוק. מה אתה רוצה לקנות? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |

## 16. Clothing store (`clothing_store`)

- Session ID: `manual-sim-16-clothing_store-1781269225`

| # | Student message | Bot response | Expected | Source/diagnosis | Notes |
|---:|---|---|---|---|---|
| 1 | שיחה בחנות בגדים | אנחנו בחנות בגדים. אני המוכר. איזו מידה אתה צריך? | Expected tutor to start a practical role-play for this setting. | `local/router` | OK |
| 2 | חולצה | יופי, חולצה. איזו מידה אתה צריך? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 3 | חולצה זה בגד | יפה. חולצה זה נכון. איזו מידה אתה צריך? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 4 | אני רוצה חולצה | יפה. אמרת משפט עם חולצה. נשארים בחנות בגדים. איזו מידה אתה צריך? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 5 | מידה | יופי, מידה. איזו מידה אתה צריך? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 6 | מידה זה מספר | יפה. מידה זה נכון. איזו מידה אתה צריך? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 7 | כמה זה עולה | אפשר לשאול: כמה זה עולה? איזו מידה אתה צריך? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 8 | יקר לי | יפה. אמרת משפט עם לי. נשארים בחנות בגדים. איזו מידה אתה צריך? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 9 | יש צבע כחול | יפה. אמרת משפט עם כחול. נשארים בחנות בגדים. איזו מידה אתה צריך? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 10 | תודה | בבקשה. נשארים בחנות בגדים. איזו מידה אתה צריך? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |

## 17. Library (`library`)

- Session ID: `manual-sim-17-library-1781269225`

| # | Student message | Bot response | Expected | Source/diagnosis | Notes |
|---:|---|---|---|---|---|
| 1 | שיחה בספרייה | אנחנו בספרייה. אני הספרן. איזה ספר אתה מחפש? | Expected tutor to start a practical role-play for this setting. | `local/router` | OK |
| 2 | ספר | יופי, ספר. איזה ספר אתה מחפש? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 3 | ספר זה דבר שקוראים | יפה. ספר זה נכון. איזה ספר אתה מחפש? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 4 | אני רוצה ספר | יפה. אמרת משפט עם ספר. נשארים בספרייה. איזה ספר אתה מחפש? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 5 | איפה הספר | אפשר לשאול: איפה הספר? איזה ספר אתה מחפש? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 6 | שקט | יופי, שקט. איזה ספר אתה מחפש? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 7 | שקט זה טוב | יפה. שקט זה נכון. איזה ספר אתה מחפש? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 8 | אני לומד כאן | יפה. אמרת משפט עם לומד. נשארים בספרייה. איזה ספר אתה מחפש? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 9 | בסדר | בסדר. נשארים בספרייה. איזה ספר אתה מחפש? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |
| 10 | תודה | בבקשה. נשארים בספרייה. איזה ספר אתה מחפש? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |

## 18. Gym (`gym`)

- Session ID: `manual-sim-18-gym-1781269226`

| # | Student message | Bot response | Expected | Source/diagnosis | Notes |
|---:|---|---|---|---|---|
| 1 | שיחה בחדר כושר | אנחנו בדירה. אני השכן. מה יש בבית? | Expected tutor to start a practical role-play for this setting. | `local/router` | OK |
| 2 | ספורט | יופי, ספורט. מה יש בבית? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 3 | ספורט זה פעילות | יפה. ספורט זה נכון. מה יש בבית? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 4 | אני רוצה להתאמן | יפה. אמרת משפט עם להתאמן. נשארים בדירה. מה יש בבית? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 5 | מים | יופי, מים. מה יש בבית? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 6 | אני שותה מים | יפה. אמרת משפט עם מים. נשארים בדירה. מה יש בבית? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 7 | מנוי | יופי, מנוי. מה יש בבית? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 8 | מנוי זה חשבון | יפה. מנוי זה נכון. מה יש בבית? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 9 | לא יודע | לא נורא. נשארים בדירה. מה יש בבית? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |
| 10 | יאללה | יאללה. נשארים בדירה. מה יש בבית? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |

## 19. Workplace (`workplace`)

- Session ID: `manual-sim-19-workplace-1781269226`

| # | Student message | Bot response | Expected | Source/diagnosis | Notes |
|---:|---|---|---|---|---|
| 1 | שיחה בעבודה | אנחנו בעבודה. אני המנהל. איזו פגישה יש לך? | Expected tutor to start a practical role-play for this setting. | `local/router` | OK |
| 2 | עבודה | יופי, עבודה. איזו פגישה יש לך? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 3 | מה זה עבודה | עבודה: עבודה היא פעולה או מקום פרנסה. לדוגמה: עבודה טוב. תוכל לכתוב משפט עם עבודה? איזו פגישה יש לך? | Expected meaning if known, otherwise no hallucination and a practice prompt. | `local/router` | OK |
| 4 | אני עובד היום | יפה. אמרת משפט עם היום. נשארים בעבודה. איזו פגישה יש לך? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 5 | משרד | יופי, משרד. איזו פגישה יש לך? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 6 | משרד זה מקום | יפה. משרד זה נכון. איזו פגישה יש לך? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 7 | פגישה | יופי, פגישה. איזו פגישה יש לך? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 8 | יש לי פגישה | יפה. אמרת משפט עם פגישה. נשארים בעבודה. איזו פגישה יש לך? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 9 | בסדר | בסדר. נשארים בעבודה. איזו פגישה יש לך? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |
| 10 | תודה | בבקשה. נשארים בעבודה. איזו פגישה יש לך? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |

## 20. Municipality (`municipality`)

- Session ID: `manual-sim-20-municipality-1781269227`

| # | Student message | Bot response | Expected | Source/diagnosis | Notes |
|---:|---|---|---|---|---|
| 1 | שיחה בעירייה | אנחנו בעירייה. אני הפקיד. איזה טופס אתה צריך? | Expected tutor to start a practical role-play for this setting. | `local/router` | OK |
| 2 | עירייה | יופי, עירייה. איזה טופס אתה צריך? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 3 | מה זה עירייה | עירייה: עירייה היא המשרד שמנהל את העיר. לדוגמה: עירייה טוב. תוכל לכתוב משפט עם עירייה? איזה טופס אתה צריך? | Expected meaning if known, otherwise no hallucination and a practice prompt. | `local/router` | OK |
| 4 | אני צריך טופס | יפה. אמרת משפט עם טופס. נשארים בעירייה. איזה טופס אתה צריך? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 5 | טופס זה דף | יפה. טופס זה נכון. איזה טופס אתה צריך? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 6 | תור | יופי, תור. איזה טופס אתה צריך? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 7 | יש לי תור | יפה. אמרת משפט עם תור. נשארים בעירייה. איזה טופס אתה צריך? | Expected short learner-sentence continuation inside the scenario. | `local/router` | OK |
| 8 | מסמך | יופי, מסמך. איזה טופס אתה צריך? | Expected single-word practice prompt or known glossary response. | `local/router` | OK |
| 9 | מסמך זה נייר | יפה. מסמך זה נכון. איזה טופס אתה צריך? | Expected teacher to accept/shape the learner definition and ask a follow-up. | `local/router` | OK |
| 10 | תודה | בבקשה. נשארים בעירייה. איזה טופס אתה צריך? | Expected local conversational continuation, not LLM/provider quota. | `local/router` | OK |

## Aggregate Findings

- Total turns: 200
- Local/router turns: 200
- LLM/provider turns: 0
- Cache turns: 0
- Fallback turns: 0
- Provider quota fallbacks: 0
- Unknown non-fallback route: 0
- Request errors: 0

Result: all scripted everyday-life simulations completed without fallback interruption.
