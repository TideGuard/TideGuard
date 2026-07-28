# TideGuard

[![CI](https://github.com/OWNER/TideGuard/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/TideGuard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/OWNER/TideGuard)

Lightweight, open-source **waiting room** for [Cloudflare Workers](https://workers.cloudflare.com/) — inspired by products like Queue-it, built for the edge.

TideGuard protects origin capacity during traffic spikes by placing visitors in a virtual waiting room — **Queue Mode** (FIFO) or **Lottery Mode** (random) — then admitting them at a controlled rate with signed access tokens.

> Replace `OWNER/TideGuard` in the badges above with your GitHub org or username after publishing.

## Features

- Virtual waiting room on Cloudflare Workers (Queue Mode or Lottery Mode)
- Durable Object as the authoritative queue coordinator
- KV for configuration and eventually-consistent reads
- Typed REST API with structured errors
- HMAC-signed admission tokens
- Pluggable ETA calculation
- Vanilla HTML waiting room and protected demo site
- One-click Deploy to Cloudflare

## Architecture

```text
Browser
  │
  ▼
Cloudflare Worker   ← routing, auth, HTML, config validation
  │
  ├─► Durable Object (QueueRoom)  ← admission order, heartbeats
  │
  └─► Cloudflare KV               ← config / branding / metrics snapshots
```

| Component          | Responsibility                                               |
| ------------------ | ------------------------------------------------------------ |
| **Worker**         | Stateless edge entrypoint: HTTP routing, token checks, HTML  |
| **Durable Object** | Strongly consistent queue state for one named queue          |
| **KV**             | Fast global reads for config — never used for queue ordering |

Durable Objects are preferred over KV for queue state because admission needs serialized, strongly consistent writes. KV is eventually consistent and cannot safely coordinate concurrent join/admit operations.

See [docs/architecture.md](docs/architecture.md) for request lifecycle diagrams and design notes.

## Quick start

### Prerequisites

- Node.js 20+
- A Cloudflare account (for deploy)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) via local `npm` scripts

### Install

```bash
git clone https://github.com/OWNER/TideGuard.git
cd TideGuard
npm install
npm run types
cp .dev.vars.example .dev.vars
# Set TOKEN_SECRET to a random value: openssl rand -hex 32
```

### Local development

```bash
npm run dev
```

Open `http://localhost:8787` and `http://localhost:8787/health`.

### Test / lint

```bash
npm run ci
```

### Load tests

```bash
npm run test:load                          # 1000 users (in-memory)
LOAD_TEST_USERS=5000 npm run test:load
LOAD_TEST_USERS=100000 npm run test:load
RUN_DO_LOAD=1 LOAD_TEST_USERS=500 npm run test:load:do
```

## Cost calculator

Open [`/cost`](/cost) on a running Worker (or locally via `npm run dev`) for an interactive estimate.

The model lives in `src/core/cost-estimate.ts` and is also exposed as:

```bash
curl "http://localhost:8787/api/cost-estimate?visitors=5000000&averageWaitSeconds=900"
```

It prices Workers requests/CPU and Durable Object requests/duration on Workers Paid list rates. Polling while visitors wait is usually the dominant line item.

### Deploy

```bash
npm run deploy
```

Or use the **Deploy to Cloudflare** button at the top of this README. Cloudflare clones the repo, provisions KV and Durable Objects from `wrangler.jsonc`, and deploys the Worker.

Set the `TOKEN_SECRET` secret when prompted (or with `npx wrangler secret put TOKEN_SECRET`).

## Configuration

Defaults live in `wrangler.jsonc` under `vars`:

| Variable                    | Default      | Meaning                           |
| --------------------------- | ------------ | --------------------------------- |
| `MAX_CONCURRENT_USERS`      | `20`         | Capacity past the waiting room    |
| `ADMIT_PER_SECOND`          | `2`          | Steady admission rate             |
| `TOKEN_TTL_SECONDS`         | `600`        | Admission token lifetime          |
| `HEARTBEAT_TIMEOUT_SECONDS` | `60`         | Drop silent waiting visitors      |
| `QUEUE_TIMEOUT_SECONDS`     | `1800`       | Max time in queue                 |
| `DEFAULT_QUEUE`             | `default`    | Queue name when none is specified |
| `ADMISSION_MODE`            | `queue`      | `queue` (FIFO) or `lottery`       |
| `ENVIRONMENT`               | `production` | Reported by `/health`             |

Secrets:

| Secret         | Purpose                       |
| -------------- | ----------------------------- |
| `TOKEN_SECRET` | HMAC key for admission tokens |

## API (current)

| Method | Path                 | Description                          |
| ------ | -------------------- | ------------------------------------ |
| `GET`  | `/health`            | Liveness and version                 |
| `GET`  | `/`                  | Landing page                         |
| `POST` | `/join`              | Enter a queue                        |
| `GET`  | `/status`            | Visitor position / admission         |
| `POST` | `/leave`             | Leave the queue                      |
| `POST` | `/heartbeat`         | Keep a waiting visitor alive         |
| `GET`  | `/admin`             | Setup wizard / login / control room  |
| `GET`  | `/api/admin/*`       | Admin bootstrap, state, branding API |
| `POST` | `/admit`             | Operator force-admit (auth required) |
| `POST` | `/mode`              | Operator set Queue/Lottery mode      |
| `GET`  | `/metrics`           | Queue statistics                     |
| `GET`  | `/cost`              | Ballpark cost calculator (HTML)      |
| `GET`  | `/api/cost-estimate` | JSON cost estimate                   |

Full request/response details: [docs/api.md](docs/api.md).

Visitor UI:

| Path            | Description                                           |
| --------------- | ----------------------------------------------------- |
| `/wait?queue=…` | Waiting room (add `&embed=1` for iframe widget; `&showWaiting=1` to show queue depth) |
| `/demo?queue=…` | Protected demo (redirects to `/wait` without a token) |
| `/admin`        | Setup wizard, login, and branding / mode control room |
| `/cost`         | Cloudflare cost calculator for a launch               |

JSON: `GET /api/cost-estimate?visitors=5000000&averageWaitSeconds=900`

## Project layout

```text
src/
  core/             Shared types, config, ETA, errors
  auth/             Admission tokens, admin password + session
  admin/            Admin KV store helpers
  queue/            Pure queue engine (extractable later)
  routes/           HTTP handlers
  durable-object/   QueueRoom Durable Object
  demo/             Protected demo page
  html/             Waiting-room + admin templates
test/               Vitest + Workers pool tests
public/             Static assets
docs/               Architecture and deeper guides
.github/            CI, templates, Dependabot
```

## Security

- Admission tokens are HMAC-SHA256 signed and time-limited (see [docs/api.md](docs/api.md)).
- Protected routes must verify tokens with a timing-safe comparison (`requireAdmission`).
- `POST /admit` and `POST /mode` accept an admin session cookie or `TOKEN_SECRET` bearer / `X-TideGuard-Operator`.
- First deploy: open `/admin` and complete the setup wizard (creates the admin password in KV).
- Secrets never belong in source control — use `.dev.vars` locally and Wrangler secrets in production.
- Do not use KV as the source of truth for queue membership or ordering.
- Prefer 2–3s polling intervals on waiting pages to limit Durable Object request volume.

## Roadmap

- [x] Project scaffold, config validation, health endpoint
- [x] Durable Object queue (join / leave / admit / heartbeat)
- [x] Queue Mode (FIFO) and Lottery Mode (random admit)
- [x] REST API + HMAC admission tokens
- [x] Waiting room HTML + protected demo (+ embed mode)
- [x] Admin dashboard with setup wizard and live branding preview
- [ ] Deploy-button polish and OpenAPI (stretch)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
