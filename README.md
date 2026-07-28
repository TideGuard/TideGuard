# TideGuard

[Website](https://tideguard.dev)

<p>
  <a href="https://github.com/TideGuard/TideGuard/actions/workflows/ci.yml"><img src="https://github.com/TideGuard/TideGuard/actions/workflows/ci.yml/badge.svg" alt="CI" height="20" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" height="20" /></a>
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/TideGuard/TideGuard"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" height="20" /></a>
</p>

**An open-source waiting room for Cloudflare Workers.**  
Hold the flood at the edge. Admit people at a rate your origin can survive.

When a launch, drop, or ticket sale spikes traffic, TideGuard puts visitors in a calm virtual line (or a lottery pool), then lets them through with signed access tokens. Built on Workers, Durable Objects, and KV. Cheap to run, easy to explain, ready to deploy.

```text
Spike hits → waiting room → controlled admit → signed token → protected page
```

## Why TideGuard

Commercial waiting rooms work. They are also expensive, opaque, and hard to study.

TideGuard is the opposite shape:

| You get                        | Why it matters                                                      |
| ------------------------------ | ------------------------------------------------------------------- |
| **Durable Object queue**       | Strong consistency for join / leave / admit. KV is not a queue.     |
| **Queue Mode or Lottery Mode** | Fair FIFO line, or equal-odds random draw among waiters.            |
| **HMAC admission tokens**      | Time-limited access without a session database.                     |
| **Admin setup wizard**         | Branding, mode, and depth display with live preview before KV save. |
| **Cost calculator**            | Ballpark Cloudflare spend before the launch, not after the invoice. |
| **One-click deploy**           | `wrangler.jsonc` is Deploy-to-Cloudflare friendly out of the box.   |

## Try it in three steps

1. **Deploy** with the button above (or `npm run deploy`).
2. Set the `TOKEN_SECRET` secret (`openssl rand -hex 32`).
3. Open `/admin`, finish the setup wizard, then hit `/demo`.

Visitors land on `/wait`. Operators live in `/admin`. Costs are estimated on `/cost`.

## What visitors see

- **Queue Mode:** position, estimated wait, optional ahead / behind counts
- **Lottery Mode:** odds in the pool, optional pool size
- Heartbeats so abandoned tabs leave the line
- Soft branding (colors, title, message) without rewriting the waiting-room layout

Depth stats are off by default. Turn them on in admin (`showWaitingCount`) or with `?showWaiting=1` on `/wait`.

## Architecture (short version)

```text
Browser
  │
  ▼
Worker          routing · tokens · HTML · validation
  │
  ├─► QueueRoom (Durable Object)   authoritative waiting pool
  └─► CONFIG_KV                    branding + admin password hash
```

One Durable Object instance per queue name. One alarm per active queue for rate-limited admission and expiry. **No KV writes on join, status, or heartbeat.** That is the cost discipline.

Deep dive: [docs/architecture.md](docs/architecture.md)

## Documentation

| Guide                                      | Start here if you want to…                               |
| ------------------------------------------ | -------------------------------------------------------- |
| [Getting started](docs/getting-started.md) | Clone, run locally, deploy, first `/admin` setup         |
| [Architecture](docs/architecture.md)       | Understand Workers / DO / KV choices and cost rules      |
| [API](docs/api.md)                         | Integrate `/join`, `/status`, tokens, operator routes    |
| [Admin](docs/admin.md)                     | Wizard, login, branding preview, mode switch, reset      |
| [Load testing](docs/load-testing.md)       | Prove FIFO / lottery behavior at 1k–100k simulated users |
| [Security](SECURITY.md)                    | Secrets, tokens, and what not to put in git              |

## Quick start (local)

```bash
git clone https://github.com/TideGuard/TideGuard.git
cd TideGuard
npm install
npm run types
cp .dev.vars.example .dev.vars   # set TOKEN_SECRET
npm run dev
```

| URL                          | Purpose                                              |
| ---------------------------- | ---------------------------------------------------- |
| http://localhost:8787        | Landing                                              |
| http://localhost:8787/wait   | Waiting room                                         |
| http://localhost:8787/demo   | Protected demo (redirects to `/wait` until admitted) |
| http://localhost:8787/admin  | Setup wizard / control room                          |
| http://localhost:8787/cost   | Cost calculator                                      |
| http://localhost:8787/health | Liveness                                             |

```bash
npm run ci            # format, lint, typecheck, tests
npm run test:load     # in-memory scale test (see docs/load-testing.md)
```

## Configuration

Defaults live in `wrangler.jsonc` under `vars`:

| Variable                    | Default      | Meaning                        |
| --------------------------- | ------------ | ------------------------------ |
| `MAX_CONCURRENT_USERS`      | `20`         | Capacity past the waiting room |
| `ADMIT_PER_SECOND`          | `2`          | Steady admission rate          |
| `TOKEN_TTL_SECONDS`         | `600`        | Admission token lifetime       |
| `HEARTBEAT_TIMEOUT_SECONDS` | `60`         | Drop silent waiting visitors   |
| `QUEUE_TIMEOUT_SECONDS`     | `1800`       | Max time in queue              |
| `DEFAULT_QUEUE`             | `default`    | Queue when none is specified   |
| `ADMISSION_MODE`            | `queue`      | `queue` (FIFO) or `lottery`    |
| `ENVIRONMENT`               | `production` | Reported by `/health`          |

| Secret         | Purpose                                        |
| -------------- | ---------------------------------------------- |
| `TOKEN_SECRET` | HMAC key for visitor tokens and admin sessions |

Full deploy checklist: [docs/getting-started.md](docs/getting-started.md)

## Project layout

```text
src/
  core/             Types, config, ETA, cost model
  auth/             Admission tokens, admin password + session
  admin/            KV helpers for branding and setup
  queue/            Pure queue engine + in-memory load simulator
  durable-object/   QueueRoom (SQLite + alarms)
  routes/           HTTP adapters
  html/             Waiting room, admin, cost calculator
  demo/             Protected demo page
docs/               Guides (start with docs/README.md)
test/               Vitest + Workers pool tests
```

## Roadmap

- [x] Durable Object waiting room (Queue + Lottery)
- [x] REST API + HMAC admission tokens
- [x] Waiting room, demo, embed mode, cost calculator
- [x] Admin wizard with live branding preview
- [x] Docs hub (getting started, architecture, API, admin, load testing)
- [ ] OpenAPI spec
- [ ] Deploy-button polish and richer operator controls in UI

## Contributing

PRs welcome. Keep the surface small and the story clear. See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
