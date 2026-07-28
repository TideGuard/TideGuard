# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- FIFO `QueueRoom` Durable Object with join, leave, status, heartbeat, metrics, and pause
- **Lottery Mode** — uniform random admission among waiters (`ADMISSION_MODE` / `POST /mode`)
- Rate-limited admission via a single per-queue alarm (cleared when idle)
- Pure queue helpers for ETA ticks, expiry, and capacity math
- Cost guidance: no KV writes on the queue hot path
- Typed REST API (`/join`, `/status`, `/leave`, `/heartbeat`, `/admit`, `/mode`, `/metrics`)
- HMAC-SHA256 admission tokens with timing-safe verification
- Waiting room page (`/wait`) with embed mode, polling, and heartbeats (odds in Lottery Mode)
- Optional waiting-room depth display (`showWaitingCount` branding / `?showWaiting=1`)
- Admin setup wizard (PBKDF2 password in KV) + session login
- Admin control room with live branding preview (KV write on Save only)
- Operator auth accepts admin session cookie or `TOKEN_SECRET` bearer
- Protected demo (`/demo`) gated by admission token cookie
- Configurable in-memory load tests (100 → 100k users) plus optional DO load suite
- Public cost calculator (`/cost` + `/api/cost-estimate`) for launch ballpark spend

### Changed

- Initial project scaffold for Cloudflare Workers
- Typed configuration validation and simple ETA calculator
- `GET /health` and landing page
- Vitest Workers pool tests, ESLint, Prettier, and GitHub Actions CI
- Open-source docs: README, architecture, contributing, code of conduct, security policy

## [0.1.0] - 2026-07-28

### Added

- Project bootstrap under the MIT license
