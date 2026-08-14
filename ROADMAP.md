# Roadmap

Intentional upcoming work for TideGuard. **Shipped changes live in [CHANGELOG.md](CHANGELOG.md)** — do not treat the changelog as a roadmap.

**Active track:** strengthen the open-source product before hosted distribution. Hosted SaaS remains designed in [docs/hosted-saas.md](docs/hosted-saas.md); it is not the current build focus.

Filter for every item: [PRODUCT.md](PRODUCT.md) — one job per surface, calm under load, no KV on the hot path.

## Recently shipped (Track 1–2)

See [CHANGELOG.md](CHANGELOG.md) Unreleased for details:

- Visitor Turnstile on `/join`
- Durable operator webhooks (outbox + retries + new events)
- `@tideguard/verify` package
- Waiting-room locales (`en` / `de` / `fr` / `es` / `ja`)
- `closesAt` + room phase (reject / passthrough)
- Multi-queue controls in `/admin`
- Waiting-room rules (bypass / JSON / reject-when-full)
- Background-tab keep-open copy + optional Web Notifications
- Staging load-test recipe + admin depth warnings
- Admission revoke via `tokenEpoch` (fixed TTL; no sliding renewal)
- Architecture guidance: one DO per queue — do not shard a single FIFO

## Near term

| Item                 | Notes                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------- |
| Split `TOKEN_SECRET` | Deferred — additive `ADMISSION_SECRET` / `ADMIN_SESSION_SECRET` / `SEAL_SECRET` later |

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

1. **Split `TOKEN_SECRET` blast radius** — additive secrets with fallback to `TOKEN_SECRET` for existing deploys.
2. **Hosted Starter control plane** — per [docs/hosted-saas.md](docs/hosted-saas.md) phases 1–3.
3. **Shopify waiting-room adapter** — thin app proxy / checkout → `/wait` + verify SDK.
4. **Staff / pre-reg named queue** — explicit fairness trade; never silent FIFO reorder.

## Contributing

Pick an item above (or an open [GitHub issue](https://github.com/TideGuard/TideGuard/issues)), keep the PR focused, and follow [CONTRIBUTING.md](CONTRIBUTING.md). Propose roadmap edits in a PR that updates this file.
