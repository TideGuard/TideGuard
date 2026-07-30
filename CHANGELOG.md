# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Setup Cloudflare **token-verify** gate (`POST /api/admin/setup/cloudflare/token-verify`) before zone/hostname
- In-wizard roadmap, per-step guides, Cloudflare deeplinks, and progressive 2a→2d substeps (token → zone → SSL → domain)
- Cloudflare setup **2a/2b/2c** sub-steps (verify+Fix → SSL Set/Skip → domain Attach/Skip) with Verified/Skipped gates
- Admin password policy (8+, uppercase, digit or symbol, match) with live checklist on Account + invite
- After setup, browser Back / bfcache never re-opens the claim wizard
- **`npm run setup`** — interactive local bootstrap (Wrangler types, `.dev.vars` / `TOKEN_SECRET`, handoff to `/admin`; `--yes` / `--dev` flags)
- Clearer setup-wizard errors — per-failure Cloudflare/Turnstile copy, proxy fix suggestions under verify status
- **Guided 5-step `/admin` setup** — Account → Cloudflare verify → Turnstile → Queue → Branding (with in-wizard roadmap and per-step guides)
- **Required Cloudflare API verify** during setup (token + zone); Fix proxied DNS / IP Geolocation; optional Full (strict) SSL and custom-domain attach
- **Turnstile for admin auth** — wizard provisions a widget via Cloudflare API; login and invite accept require siteverify (plus existing rate limits)
- **Cloudflare control plane in admin** — IP Geolocation toggle (off clears country block), Set Full (strict), list/add/remove Workers custom domains; verify-on-save for new API tokens
- Sticky admin footer (TideGuard · version · © 2026 · MIT · docs / GitHub / waiting room)
- Multi-admin accounts (username + PBKDF2 password), 72h hashed invite links, Activity audit log, and confirm dialogs for consequential toggles
- First-run `GET /` → `/admin` redirect until setup is complete
- Docs: Authenticated Origin Pulls + Full (strict) as required origin lock-down
- README restructured into What / Basic features / Extended features
- Admin **Updates** panel + `GET /api/admin/updates` — compare running `0.1.0` to GitHub `releases/latest` (KV-cached)
- Istanbul coverage via `npm run test:coverage` (~80% lines on `src/`); README badge + sales row
- Operator [upgrading guide](docs/upgrading.md) for Deploy-to-Cloudflare forks and CLI redeploys (preserve KV IDs, secrets, queue state)
- FIFO `QueueRoom` Durable Object with join, leave, status, heartbeat, metrics, and pause
- **Lottery Mode** — uniform random admission among waiters (`ADMISSION_MODE` / `POST /mode`)
- Rate-limited admission via a single per-queue alarm (cleared when idle)
- Pure queue helpers for ETA ticks, expiry, and capacity math
- Cost guidance: no KV writes on the queue hot path
- Typed REST API (`/join`, `/status`, `/leave`, `/heartbeat`, `/admit`, `/mode`, `/metrics`)
- HMAC-SHA256 admission tokens with timing-safe verification
- Waiting room page (`/wait`) with embed mode, polling, and heartbeats (odds in Lottery Mode)
- Optional waiting-room depth display (`showWaitingCount` branding)
- Opening schedule (`opensAt`), silent pause, and graduated origin health throttle
- Admin Traffic panel + `/api/admin/schedule` / `pause` / `health`
- Admin setup wizard (PBKDF2 password in KV) + session login
- Admin control room with live branding preview (KV write on Save only)
- **Live queue** panel (≈5s refresh) with waiting / admitted / wait times / open slots / geo hits
- **Analytics** panel — 5-minute client-side charts for queue depth, average wait, and geo-block hits (1h / 12h / 24h)
- **IP allowlist** — staff bypass via `CF-Connecting-IP` without consuming queue capacity
- **Pass queue** — admin-issued admission cookie for this browser (`POST /api/admin/pass`)
- **Country block** — temporary `CF-IPCountry` gate with TTL, hit counters, and allowlist/Pass overrides
- Operator auth accepts admin session cookie or `TOKEN_SECRET` bearer
- Protected demo (`/demo`) gated by admission token cookie
- Configurable in-memory load tests (100 → 100k users) plus optional DO load suite
- Public cost calculator (`/cost` + `/api/cost-estimate`) for launch ballpark spend
- Docs hub: getting started, architecture, API, admin, analytics, IP allowlist, country block, load testing
- Configurable origin proxy: gate non-TideGuard paths and forward to upstream (`ORIGIN_URL` / admin UI)

### Changed

- Deploy-to-Cloudflare / `wrangler.jsonc` no longer templates `ORIGIN_*`, `DEFAULT_QUEUE`, or `ADMISSION_MODE` — those are set in `/admin` after deploy
- Cloudflare access is no longer “optional Check/Fix later only” — required in first-run setup; dashboard panel expanded into zone controls
- Admin login / invite accept fail closed when Turnstile is configured
- Initial project scaffold for Cloudflare Workers
- Typed configuration validation and simple ETA calculator
- `GET /health` and landing page
- Vitest Workers pool tests, ESLint, Prettier, and GitHub Actions CI
- Open-source docs: README, architecture, contributing, code of conduct, security policy
- `GET /metrics` requires operator auth; public join/status omit depth unless `showWaitingCount`
- `POST /join` resumes existing `tg_ticket` (same-browser multi-tab); removed `?showWaiting=1`

## [0.1.0] - 2026-07-28

### Added

- Project bootstrap under the MIT license
