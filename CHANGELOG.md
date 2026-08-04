# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
