# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
- Optional **Cloudflare access** helper (Zone ID + API token) to check/fix proxied DNS and IP Geolocation
- Operator auth accepts admin session cookie or `TOKEN_SECRET` bearer
- Protected demo (`/demo`) gated by admission token cookie
- Configurable in-memory load tests (100 → 100k users) plus optional DO load suite
- Public cost calculator (`/cost` + `/api/cost-estimate`) for launch ballpark spend
- Docs hub: getting started, architecture, API, admin, analytics, IP allowlist, country block, load testing
- Configurable origin proxy: gate non-TideGuard paths and forward to upstream (`ORIGIN_URL` / admin UI)

### Changed

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
