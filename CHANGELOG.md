# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Canonical releases:** [GitHub Releases](https://github.com/TideGuard/TideGuard/releases) (what the admin Updates panel checks) · site mirror [tideguard.dev/changelog](https://tideguard.dev/changelog) · upgrade path [docs/upgrading.md](docs/upgrading.md).

## [Unreleased]

### Added

- **Google Analytics** — optional GA4 Measurement ID (`G-…`) in Branding; injects Google’s official gtag snippet on `/wait` (CSP allowlists Google analytics hosts)
- **Timeslot status check-ins** — fixed 750 RPS budget, ≥5s period; server assigns `nextCheckAt`; early `/status` is read-only; missed-slot expiry; default queue stay timeout 24h
- **Max waiting visitors** cap (default 1M) with `/api/admin/queue-limits` and System → Danger zone A→B confirm
- **Missed-slot grace** override (default **120s**, clamp **30…900**) via queue config / `MISSED_SLOT_GRACE_SECONDS` and System → Danger zone (`/api/admin/queue-limits`)
- **Versioned operator Terms of Service** ([`TERMS.md`](TERMS.md), `TOS_VERSION`) — claim / invite / re-accept require `acceptedTosVersion` matching the current version; re-accept on login after a version bump; session APIs return `403 tos_required` until accepted; admin footer links Terms / License / Issues

### Changed

- **README** — operator pitch regrouped by job (waiting room, control room, origin); internals stay in docs
- Waiting UI / embed / API: schedule on `nextCheckAt`; optional **#X of Y** via Branding “Show place in line”
- **Pre-open check-ins** — when `opensAt` is in the future, `nextCheckAt` is assigned at/after opening (full-depth timeslot spread); status does not renew liveness until then
- **Room phase + next update** — public join/status include `admissionOpen` and (while scheduled closed) `opensAt`; waiting UI shows “Queue is open — keep this page open” / opening countdown plus **Next update** from `nextCheckAt`
- Cost estimate adaptive path uses timeslot period (`max(5, ceil(waiting/750))`) instead of √progress average
- **Lint:** ESLint + `typescript-eslint` → [Oxlint](https://oxc.rs/) (`oxlint` + `oxlint-tsgolint`) for TypeScript 7–compatible, type-aware linting
- **TypeScript 7.0** as the project compiler (`tsc` / typecheck)
- Dev dependencies bumped (notably `wrangler` 4.121, `@cloudflare/vitest-pool-workers` 0.21, `vite` 8.2.1, `oxlint` 1.78, `@scure/bip39` 2.3)

### Upgrade notes

- Default `QUEUE_TIMEOUT_SECONDS` is now **86400** (24h). Override only if you intentionally want shorter max stays; too-short values expire deep-queue waiters between timeslots.
- Missed-slot grace defaults to **120s** (unchanged behavior). Optionally tune in System → Danger zone or `MISSED_SLOT_GRACE_SECONDS` (30–900); lower values expire backgrounded waiters sooner.
- After upgrading to a build that introduces or bumps `TOS_VERSION`, each admin must accept the Terms of Service in `/admin` before the control room APIs work again.
- Contributors: use `npm run lint` (Oxlint), not ESLint. Node 24+ and TypeScript 7 are required for local typecheck/lint.

## [0.3.0] - 2026-08-04

### Added

- **OpenAPI 3.1** contract at [`openapi.yaml`](openapi.yaml)
- **Demo mode** — post-setup origin stays ungated; control-room banner + **Go live**; smoke-test `/demo`
- **BIP39 English recovery** (12 words via `@scure/bip39`) — shown at claim/invite; Forgot password with Turnstile; Team regenerate
- **Rolling-throughput ETA (v1.5)** — blends setpoint admit rate with recent observed admits from traffic buckets
- **24h traffic retention** + Live chart range presets (2h / 12h / 24h) and **CSV export** (`GET /api/admin/traffic?format=csv`)
- **TOKEN_SECRET rotation** guide (`docs/token-secret-rotation.md`) + `npm run rotate:token-secret`; System panel checklist
- **Cloudflare Access / Zero Trust** guidance for `/admin` (Access tab + SECURITY.md)
- **Operator webhooks** — pause, health config, waiting-depth threshold (`PUT /api/admin/webhooks`)
- **Load-test CI smoke** — `LOAD_TEST_USERS=50` job on every PR
- Waiting-room **embed height** `postMessage`, tighter embed CSS, Branding snippet; **a11y** (`aria-live` / progressbar) + **`?lang=`** i18n stubs
- Clearer **queues vs path prefixes** copy; scheduled-room discoverability (Admission alert + toolbar Status)
- First-run **time to green** alert + Finish-step Demo mode tip
- Docs: Demo mode in getting-started / protecting-origin / launch checklist; recovery, webhooks, rotation guides

### Changed

- Traffic docs / OpenAPI / admin copy: retention **2h → 24h**
- Path prefixes accept newlines as well as commas

## [0.2.0] - 2026-08-04

### Added

- Admin control room: sticky **event toolbar** (rate, pause, force-admit, Pass queue, clear rate override), section tabs, waiting-room branding preview + font family, geo-block hit stats, Cloudflare domains / Fix proxy / IP Geolocation UI, Turnstile status, factory reset, password change, remove teammate
- `PUT /api/admin/password` and `DELETE /api/admin/users/:id`
- TOKEN_SECRET acknowledgment modal before claim / factory reset; Cloudflare API token sealed on verify and cleared from the SPA
- Shared `src/auth/crypto.ts` primitives; QueueRoom `visitor-sql` helpers; CI Istanbul coverage thresholds
- Docs: [custom domain guide](docs/custom-domain.md) — full nameserver setup vs partial CNAME (Business/Enterprise), Custom Domain vs Route attach order
- Docs published at [tideguard.dev/docs](https://tideguard.dev/docs/); admin control room deep-links to matching guides
- Docs: Bot Fight Mode / WAF coexistence — keep zone security on; Skip rule for ticketed TideGuard control paths if polls are challenged
- Setup Cloudflare **token-verify** gate (`POST /api/admin/setup/cloudflare/token-verify`) before zone/hostname
- In-wizard roadmap, per-step guides, Cloudflare deeplinks, and progressive token → zone → SSL → domain substeps
- Admin password policy (8+, uppercase, digit or symbol, match) with live checklist on Account + invite
- After setup, browser Back / bfcache never re-opens the claim wizard
- **`npm run setup`** — interactive local bootstrap (Wrangler types, `.dev.vars` / `TOKEN_SECRET`, handoff to `/admin`; `--yes` / `--dev` flags)
- Clearer setup-wizard errors — per-failure Cloudflare/Turnstile copy, proxy fix suggestions under verify status
- **Guided 5-step `/admin` setup** — Account → Cloudflare verify → Turnstile → Queue → Branding
- **Required Cloudflare API verify** during setup (token + zone); Fix proxied DNS / IP Geolocation; optional Full (strict) SSL and custom-domain attach
- **Turnstile for admin auth** — wizard provisions a widget via Cloudflare API; login and invite accept require siteverify
- **Cloudflare control plane in admin** — IP Geolocation toggle, Set Full (strict), Workers custom domains
- Sticky admin footer (TideGuard · version · © 2026 · MIT · docs / GitHub / waiting room)
- Multi-admin accounts (username + PBKDF2 password), 72h hashed invite links, Activity audit log
- First-run `GET /` → `/admin` redirect until setup is complete
- Docs: Authenticated Origin Pulls + Full (strict) as required origin lock-down
- Admin **Updates** panel + `GET /api/admin/updates` — compare running `VERSION` to GitHub `releases/latest` (KV-cached)
- Istanbul coverage via `npm run test:coverage`; CI enforces thresholds (~75% lines)
- Operator [upgrading guide](docs/upgrading.md) for Deploy-to-Cloudflare forks and CLI redeploys
- FIFO `QueueRoom` Durable Object with join, leave, status, heartbeat, metrics, and pause
- **Lottery Mode** — uniform random admission among waiters (`ADMISSION_MODE` / `POST /mode`)
- Rate-limited admission via a single per-queue alarm (cleared when idle)
- Typed REST API (`/join`, `/status`, `/leave`, `/heartbeat`, `/admit`, `/mode`, `/metrics`)
- HMAC-SHA256 admission tokens with timing-safe verification
- Waiting room page (`/wait`) with embed mode, polling, and heartbeats
- Opening schedule (`opensAt`), silent pause, and graduated origin health throttle
- **Live queue** panel + **traffic chart** (server-backed ~15s buckets, ~2h)
- **IP allowlist**, **Pass queue**, **Country block**
- Operator auth accepts admin session cookie or `TOKEN_SECRET` bearer
- Protected demo (`/demo`), cost calculator (`/cost`), configurable origin proxy
- Docs hub: getting started, architecture, API, admin, analytics, IP allowlist, country block, load testing

### Changed

- Lottery waiting room shows **equal chance + ETA** (progress from ETA); raw `lotteryOdds` remain on the API for custom clients
- Docs/README analytics copy aligned with the live traffic chart (2h inflow/outflow)
- Deploy-to-Cloudflare / `wrangler.jsonc` no longer templates `ORIGIN_*`, `DEFAULT_QUEUE`, or `ADMISSION_MODE` — set in `/admin` after deploy
- Cloudflare access required in first-run setup; dashboard panel expanded into zone controls
- Admin login / invite accept fail closed when Turnstile is configured
- `GET /metrics` requires operator auth; public join/status omit depth unless `showWaitingCount`
- `POST /join` resumes existing `tg_ticket` (same-browser multi-tab); removed `?showWaiting=1`

## [0.1.0] - 2026-07-28

### Added

- Project bootstrap under the MIT license
