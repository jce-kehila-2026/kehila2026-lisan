# Chat Eval Report

- Run at: `2026-05-26T14:42:46.934288+00:00`
- Dataset: `C:\Users\mshar\Desktop\lisan\kehila2026-lisan\ai-service\evals\chat_eval_dataset.json`
- Total cases: `130`

## Metrics

- Vocabulary leakage rate: `0.0%`
- Fallback accuracy: `100.0%`
- Fallback reason accuracy: `100.0%`
- Average latency: `0.17 ms`
- P95 latency: `0.26 ms`
- Engine average latency: `0 ms`
- Engine P95 latency: `0.0 ms`
- Over-length responses: `0`

## Counts

- Fallback cases returned: `50`
- Fallback-correct cases: `130`
- Fallback-reason-correct cases: `130`
- Cache hits: `10`
- Router hits: `80`
- Vocabulary leakage cases: `0`

## Category Breakdown

| Category | Total | Fallback Correct | Leakage | Over Length | Avg Wall Latency (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| arabic_requested | 10 | 10 | 0 | 0 | 0.11 |
| mixed_language | 15 | 15 | 0 | 0 | 0.11 |
| out_of_scope | 15 | 15 | 0 | 0 | 0.25 |
| too_long | 10 | 10 | 0 | 0 | 0.16 |
| valid_curriculum | 60 | 60 | 0 | 0 | 0.19 |
| valid_router | 10 | 10 | 0 | 0 | 0.17 |
| weird_input | 10 | 10 | 0 | 0 | 0.11 |

## Failing Cases

No failing cases.
