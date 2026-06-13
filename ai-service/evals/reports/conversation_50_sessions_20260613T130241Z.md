# Lisan 50 Session Conversation Audit

- Started: 2026-06-13T13:02:41.014878+00:00
- Completed: 2026-06-13T13:02:50.880841+00:00
- Target: 50 sessions x 10 turns = 500 turns
- Completed: 0 full sessions, 2 turns
- Stopped reason: quota_or_rate_limit_at_session_01_turn_02
- Average wall latency: 4163.31 ms

## Route Counts

- `fallback:PROVIDER_QUOTA`: 1
- `llm_provider`: 1

## Fallback Reasons

- `PROVIDER_QUOTA`: 1

## 1. Greetings and self introduction (`greetings_intro`)

- Session ID: `conv50-20260613T130241Z-01-greetings_intro`
- Level: `A1`

| # | Student message | Bot answer (HE) | Bot answer (AR) | Diagnosis | Latency |
|---:|---|---|---|---|---:|
| 1 | בוא נתרגל שיחה על היכרות וברכות. | שלום, מי את? אני שמחה להכיר אותך. | مرحبا، من أكون؟ أنا سعيدة لمقابلتك. | `llm_provider` | 2682.02 |
| 2 | אני צריך להציג את עצמי בכיתה. | יש עומס עכשיו. נסי שוב עוד מעט. |  | `fallback:PROVIDER_QUOTA` | 5644.61 |
