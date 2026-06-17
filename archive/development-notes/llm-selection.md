# LLM Selection for Chat POC

## Status

This report is prepared for the Sprint 2 chat POC. Final selection should be confirmed after running the POC with Abdullah's real transcript set and reviewing the saved results in `ai-service/poc/results.md`.

## Compared Providers

| Criterion | Anthropic Claude Haiku 3.5 | OpenAI GPT-4o mini |
| --- | --- | --- |
| Hebrew quality | To be validated with POC | To be validated with POC |
| Cost per 1M input tokens | $0.80 | $0.15 |
| Cost per 1M output tokens | $4.00 | $0.60 |
| Latency | To be measured in POC | To be measured in POC |
| RTL / Arabic support | Expected good, needs POC validation | Expected good, needs POC validation |
| API stability | Mature API, needs project validation | Mature API, needs project validation |

Sources checked on May 12, 2026:
- OpenAI GPT-4o mini model page: https://developers.openai.com/api/docs/models/gpt-4o-mini
- Anthropic pricing page: https://platform.claude.com/docs/en/about-claude/pricing
- Anthropic models overview: https://docs.anthropic.com/en/docs/about-claude/models/overview

## Preliminary Recommendation

Start the POC with `gpt-4o-mini` as the default baseline because it is materially cheaper than Claude Haiku 3.5 and is positioned as a fast model for focused tasks. For this sprint, the highest-risk question is not raw reasoning depth; it is whether the model can obey strict vocabulary limits, stay inside curriculum context, and answer in under 3 seconds. GPT-4o mini is a strong first choice for that validation.

Keep Claude Haiku 3.5 as the comparison provider. If GPT-4o mini fails vocabulary control or Hebrew quality in a meaningful way, we should rerun the same prompt set against Claude before deciding to proceed or rethink the architecture.

## Trade-offs

- `gpt-4o-mini` is much cheaper, which makes repeated classroom interactions easier to sustain.
- Claude Haiku 3.5 may still be worth testing if it shows better obedience to strict response constraints.
- The POC should not assume that lower latency automatically means better classroom behavior. Constraint-following matters more than raw fluency for this use case.

## Re-evaluation Point

Re-evaluate the model choice at the end of Sprint 4, or earlier if one of these happens:

- Fewer than 7 out of 10 prompts are rated Good or Acceptable.
- Average latency is above 3 seconds.
- The model frequently leaks vocabulary outside the approved transcript set.
- Projected monthly cost exceeds the budget threshold agreed with the team.
