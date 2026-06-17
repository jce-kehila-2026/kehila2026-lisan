# Lisan Documentation

Reviewer-facing and technical documentation for the Lisan platform. Start with
the root [README](../README.md) for the project overview.

## For reviewers
- [Demo flow](demo-flow.md) — the exact walkthrough of the application.
- [Known limitations](known-limitations.md) — honest current constraints and trade-offs.

## Product & behavior
- [Product spec](spec.md) — overall chatbot product goals and requirements.
- [Chatbot specification](chatbot-spec.md) — behavioral rules, fallbacks, and answer-quality criteria.
- [Evaluation dataset](eval/README.md) — prompts and expected behaviors used to evaluate the chatbot.
- [Design system](DESIGN_SYSTEM.md) — UI/UX direction and component language.

## Technical references
- [Backend README](../backend/README.md) — backend service overview.
- [Backend API](../backend/API.md) — REST API reference.
- [AI service overview](../ai-service/AI_SERVICE_OVERVIEW.md) — AI pipeline and architecture.
- [AI provider architecture](../ai-service/PROVIDER_ARCHITECTURE.md) — LLM provider/fallback design.
- [AI manual testing guide](../ai-service/MANUAL_TESTING_GUIDE.md) — how to run and exercise the AI service.

## Operations
- [Deployment](../DEPLOY.md) — production deployment and secrets.

## Development history
Sprint plans, roadmaps, checklists, handoff notes, and point-in-time evaluation
reports are preserved under [`archive/`](../archive/) (`development-notes/` and
`eval-reports/`). They are historical context and may not reflect the current
implementation.
