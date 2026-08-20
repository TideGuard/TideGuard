# Roadmap

Intentional upcoming work for TideGuard. **Shipped changes live in [CHANGELOG.md](CHANGELOG.md)** — do not treat the changelog as a roadmap.

**Current release:** [0.5.1](CHANGELOG.md#051---2026-08-15) (2026-08-15). Feature surface shipped in [0.5.0](CHANGELOG.md#050---2026-08-15).

**Active track:** strengthen the open-source product before hosted distribution. Hosted SaaS remains designed in [docs/hosted-saas.md](docs/hosted-saas.md); it is not the current build focus.

Filter for every item: [PRODUCT.md](PRODUCT.md) — one job per surface, calm under load, no KV on the hot path.

## Recently shipped (0.5.0 / 0.5.1)

Full notes: [CHANGELOG.md § 0.5.0](CHANGELOG.md#050---2026-08-15) and [§ 0.5.1](CHANGELOG.md#051---2026-08-15).

| Theme | Highlights |
| ----- | ---------- |
| **Scale under load** | Timeslot status check-ins (~750 RPS budget, `nextCheckAt`); max waiting visitors (default 1M, raise to 50M via Danger zone); admin depth warning at 120s+ check-in period |
| **Event lifecycle** | `opensAt` / `closesAt`, pre-open deferral, post-close reject or passthrough; admission revoke via `tokenEpoch` |
| **Trust & abuse** | Visitor Turnstile on `/join`; versioned operator ToS; `@tideguard/verify` npm package |
| **Operator control room** | Multi-queue admin, waiting-room rules, durable webhooks (SQLite outbox + retries), Google Analytics on `/wait` |
| **Visitor UX** | Locales (DE/FR/ES/JA), background-tab notifications, optional place-in-line |
| **Architecture honesty** | One Durable Object per queue — do not shard a single FIFO; staging load-test recipe |
| **0.5.1** | Test coverage for the 0.5 feature surface (schedules, revoke, rules, webhooks, depth warnings) |

## Near term

| Item | Notes |
| ---- | ----- |
| **Admin scale planner** | Always-visible check-in period + status RPS summary (not only the 120s warning); comfort / stretch / split-queue guidance; links to multi-queue create and [launch checklist](docs/launch-checklist.md). UI + copy only — no engine changes. |
| **Roadmap / docs hygiene** | Keep this file and operator guides aligned with shipped releases (see Contributing below). |
| **Split `TOKEN_SECRET`** | Deferred — additive `ADMISSION_SECRET` / `ADMIN_SESSION_SECRET` / `SEAL_SECRET` with fallback to `TOKEN_SECRET` for existing deploys. |

Candidate release: **0.5.2** (operator polish + doc sync, no breaking changes).

## Later (Track 3)

- Hosted control plane ([docs/hosted-saas.md](docs/hosted-saas.md))
- Thin integration slices (Shopify, WooCommerce, Slack preset) — not a marketplace
- Staff / pre-reg lanes only as an explicit fairness trade (never silent FIFO reorder)

## Out of scope

- Queue membership in KV or D1
- Per-visitor Durable Object alarms or status KV writes
- Cartoon progress / ops-dashboard chrome on `/wait`
- Hosted identity bolted onto instance `/admin`
- Horizontal sharding of a single FIFO/lottery until a real customer needs it

## Suggested GitHub issues

1. **Admin scale planner** — live metrics panel: period, RPS, zones, split-queue guidance (near-term table above).
2. **Split `TOKEN_SECRET` blast radius** — additive secrets with fallback to `TOKEN_SECRET` for existing deploys.
3. **Hosted Starter control plane** — per [docs/hosted-saas.md](docs/hosted-saas.md) phases 1–3.
4. **Shopify waiting-room adapter** — thin app proxy / checkout → `/wait` + verify SDK.
5. **Staff / pre-reg named queue** — explicit fairness trade; never silent FIFO reorder.

## Contributing

Pick an item above (or an open [GitHub issue](https://github.com/TideGuard/TideGuard/issues)), keep the PR focused, and follow [CONTRIBUTING.md](CONTRIBUTING.md). Propose roadmap edits in a PR that updates this file.
