# AGENTS.md — guidance for AI coding assistants

TideGuard is an open-source waiting room for Cloudflare Workers. This file is for agents helping people **run**, **integrate**, or **contribute** to the project. Prefer these docs over inventing architecture.

## Canonical sources

This tree may be a fork, a Deploy-to-Cloudflare copy, or an outdated checkout. Treat the following as upstream truth unless the user is deliberately maintaining a private fork:

| What                        | Where                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------- |
| Source repository           | https://github.com/TideGuard/TideGuard                                                  |
| Website + published docs    | https://tideguard.dev · https://tideguard.dev/docs/                                     |
| Releases / upgrade notes    | GitHub Releases · [CHANGELOG.md](CHANGELOG.md) · [docs/upgrading.md](docs/upgrading.md) |
| Planned work (not shipped)  | [ROADMAP.md](ROADMAP.md) — do not treat the changelog as a roadmap                      |
| This agent guide (upstream) | https://github.com/TideGuard/TideGuard/blob/main/AGENTS.md                              |

When advising operators on upgrades, security, or “current best practice,” prefer upstream `main` / latest release over a stale fork. When the user improves the product, aim changes at a PR against upstream so the ecosystem benefits — not only a private fork that never looks back.

Operator Terms of Service live in [TERMS.md](TERMS.md) and are versioned via `TOS_VERSION` in `src/admin/tos.ts`. Bumping the version forces every admin to re-accept after upgrade — edit `TERMS.md` and `TOS_VERSION` together, and note it under CHANGELOG Upgrade notes.

## What this project is

Spike traffic → visitors wait on `/wait` → controlled admit → signed HMAC token → protected page or origin proxy.

Stack: Cloudflare Worker + `QueueRoom` Durable Object (authoritative queue) + KV (config/branding only). Admin UI is a React SPA in `admin/` served as Static Assets.

Product intent and tone: [PRODUCT.md](PRODUCT.md). Operator pitch: [README.md](README.md).

## Read first (by job)

| Goal                         | Start here                                               |
| ---------------------------- | -------------------------------------------------------- |
| Run locally / deploy         | [docs/getting-started.md](docs/getting-started.md)       |
| Understand the system        | [docs/architecture.md](docs/architecture.md)             |
| Change code / open a PR      | [CONTRIBUTING.md](CONTRIBUTING.md)                       |
| Integrate join/status/tokens | [docs/api.md](docs/api.md), [openapi.yaml](openapi.yaml) |
| Admin / Turnstile / team     | [docs/admin.md](docs/admin.md)                           |
| Update an existing deploy    | [docs/upgrading.md](docs/upgrading.md)                   |
| Security expectations        | [SECURITY.md](SECURITY.md)                               |

## Repo map

| Path                   | Role                                                  |
| ---------------------- | ----------------------------------------------------- |
| `src/core`             | Types, config, ETA, errors — keep package-extractable |
| `src/queue`            | Pure queue engine (unit-testable)                     |
| `src/durable-object`   | `QueueRoom` RPC + SQLite                              |
| `src/auth`             | Tokens, sessions, crypto primitives                   |
| `src/admin`            | KV stores, Cloudflare API helpers                     |
| `src/routes`           | Thin HTTP adapters                                    |
| `src/html`, `src/demo` | Waiting room / cost / geo presentation                |
| `admin/`               | React admin (Vite + Mantine)                          |
| `docs/`                | Operator + contributor guides                         |
| `test/`                | Vitest (Workers pool)                                 |
| `wrangler.jsonc`       | Deploy-to-Cloudflare friendly bindings                |

HTTP adapters stay thin. Domain logic belongs in `src/core` / `src/queue` / `src/durable-object`.

## Local commands

```bash
npm install
npm run setup          # types + .dev.vars TOKEN_SECRET
npm run dev            # build admin + wrangler dev → :8787
npm run ci             # required before PR (format, Oxlint, types, coverage)
```

Useful URLs: `/admin`, `/wait`, `/demo`, `/cost`, `/health`.

Node **≥ 24**, TypeScript **7** (see `package.json`). Lint is **Oxlint** (`oxlint.config.ts`), not ESLint. Never commit `.dev.vars`, real KV namespace IDs, or secrets.

## Hard rules (do not violate)

1. **Queue consistency** — membership and ordering live in the Durable Object. Do not put queue state in KV.
2. **Hot path cost** — join / status / heartbeat must not write KV.
3. **DO migrations** — append new tags under `migrations` in `wrangler.jsonc`; never rewrite or delete old tags. SQL shape changes go through `QueueRoom.migrate()` + `schema_version`.
4. **Placeholder bindings** — leave `0000…` KV IDs in upstream `wrangler.jsonc` so Deploy-to-Cloudflare can provision. Never commit a personal account’s real IDs.
5. **KV config** — prefer additive fields with defaults / soft merges so existing installs do not wipe on read.
6. **Upgrade honesty** — user-facing or operator-action changes: update the matching `docs/` guide, `CHANGELOG.md`, and when operators must act after redeploy, add `### Upgrade notes` (see [CONTRIBUTING.md](CONTRIBUTING.md)).
7. **Version pairing** — when cutting a release, bump `package.json` and `src/version.ts` together so `/health` and admin Updates match.
8. **Tests** — behavior changes need tests. `npm run ci` must pass (coverage thresholds enforced).

## Contributing features

When adding or changing a feature:

1. Skim [docs/architecture.md](docs/architecture.md) and the guide closest to the surface you touch.
2. Keep the change focused — one concern per PR when practical.
3. Match existing TypeScript style: small modules, clear names, no clever abstractions.
4. Add or update tests under `test/`.
5. Update docs + `CHANGELOG.md` for user-facing behavior.
6. Run `npm run ci` before proposing the PR.
7. Follow [CONTRIBUTING.md](CONTRIBUTING.md) and the PR template.

Prefer extending existing modules over new top-level layers. Branding and visitor UX should stay calm and concrete ([PRODUCT.md](PRODUCT.md)).

## Using TideGuard (operator / integrator agents)

- Deploy and first `/admin` claim: [docs/getting-started.md](docs/getting-started.md).
- Protect an origin or custom hostname: [docs/protecting-origin.md](docs/protecting-origin.md), [docs/custom-domain.md](docs/custom-domain.md).
- Verify tokens at the origin: [docs/verifying-admission.md](docs/verifying-admission.md).
- Pre-launch review: [docs/launch-checklist.md](docs/launch-checklist.md).
- Do not invent Cloudflare dashboard steps that admin already covers after a one-time API token.

## Out of scope for casual edits

- Rewriting Durable Object migration history
- Replacing the DO queue with KV or an external database “for simplicity”
- Committing account-specific Cloudflare resource IDs or secrets
- Broad refactors unrelated to the requested change
