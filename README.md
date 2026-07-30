# TideGuard

<p>
  <a href="https://github.com/TideGuard/TideGuard/actions/workflows/ci.yml"><img src="https://github.com/TideGuard/TideGuard/actions/workflows/ci.yml/badge.svg" alt="CI" height="20" /></a>
  <a href="#documentation"><img src="https://img.shields.io/badge/coverage-~80%25-brightgreen" alt="Line coverage ~80%" height="20" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" height="20" /></a>
</p>

<p>
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/TideGuard/TideGuard"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" height="36" /></a>
</p>

## What TideGuard does

**An open-source waiting room for Cloudflare Workers.**  
Hold the flood at the edge. Admit people at a rate your origin can survive.

When a launch, drop, or ticket sale spikes traffic, TideGuard puts visitors in a calm virtual line (or a lottery pool), then lets them through with signed access tokens. Built on Workers, Durable Objects, and KV. Cheap to run, easy to explain, ready to deploy.

```text
Spike hits → waiting room → controlled admit → signed token → protected page
```

Commercial waiting rooms work. They are also expensive, opaque, and hard to study. TideGuard is the opposite shape: open source, edge-native, and designed so you can read the queue logic.

## Basic features

| Feature                        | Why it matters                                                             |
| ------------------------------ | -------------------------------------------------------------------------- |
| **Durable Object queue**       | Strong consistency for join / leave / admit. KV is not a queue.            |
| **Queue Mode or Lottery Mode** | Fair FIFO line, or equal-odds random draw among waiters.                   |
| **HMAC admission tokens**      | Time-limited access without a session database.                            |
| **Waiting room (`/wait`)**     | Branded hold page with heartbeats, optional depth, redirect after admit.   |
| **Admin control room**         | React (Mantine) SPA: branding, live metrics, adaptive max outflow.         |
| **One-click deploy**           | `wrangler.jsonc` is Deploy-to-Cloudflare friendly out of the box.          |
| **Tested Worker logic**        | ≈80% line coverage (`npm run test:coverage`); CI runs format, lint, types. |

Visitors land on `/wait`. Operators live in `/admin`. Costs are estimated on `/cost`.

## Extended features

| Feature                     | Why it matters                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| **Origin proxy**            | Sit in front of your site; unauthenticated traffic hits `/wait`, admitted traffic is proxied. |
| **Traffic controls**        | Opening schedule, silent pause, origin health throttle.                                       |
| **IP allowlist + Pass**     | Staff skip the line; mint a temporary cookie to smoke-test.                                   |
| **Temporary country block** | Event-window geo gate via `CF-IPCountry`.                                                     |
| **Cloudflare from admin**   | Verify API token, fix proxied DNS, toggle IP Geolocation, set Full (strict), manage domains.  |
| **Turnstile on admin auth** | Setup provisions a widget; login and invites require siteverify (not rate limits alone).      |
| **Analytics**               | Control-room charts for queue depth, wait, and geo hits.                                      |
| **Cost calculator**         | Ballpark Cloudflare spend before the launch.                                                  |
| **Adaptive max outflow**    | Live admit-rate control + inflow/outflow chart (no redeploy).                                 |
| **Team invites**            | 72-hour invite links for additional admins (no email).                                        |
| **Activity audit log**      | Who turned what on or off in the control room.                                                |

Deep guides: [protecting origin](docs/protecting-origin.md) (including Authenticated Origin Pulls), [admin](docs/admin.md), [upgrading](docs/upgrading.md).

## Try it in three steps

1. **Deploy** with the button above (or `npm run deploy`).
2. Set the `TOKEN_SECRET` secret (`openssl rand -hex 32`).
3. Open the site — unfinished setups redirect to `/admin`. Finish the wizard (account → **Cloudflare verify** → **Turnstile** → queue → branding) then hit `/demo`.

## Architecture (short version)

```text
Browser
  │
  ▼
Worker          routing · tokens · HTML · geo/IP gates · validation
  │
  ├─► QueueRoom (Durable Object)   authoritative waiting pool
  └─► CONFIG_KV                    branding · admins · allowlist · geo · audit
```

One Durable Object instance per queue name. One alarm per active queue for rate-limited admission and expiry. **No KV writes on join, status, or heartbeat.** That is the cost discipline.

Deep dive: [docs/architecture.md](docs/architecture.md)

## Documentation

| Guide                                              | Start here if you want to…                               |
| -------------------------------------------------- | -------------------------------------------------------- |
| [Getting started](docs/getting-started.md)         | Clone, run locally, deploy, first `/admin` setup         |
| [Upgrading](docs/upgrading.md)                     | Update an existing deploy without losing KV / secrets    |
| [Launch checklist](docs/launch-checklist.md)       | Pre-production go-live review                            |
| [Protecting a domain](docs/protecting-origin.md)   | Custom domains, AOP, Cloudflare in front of origin       |
| [Verifying admission](docs/verifying-admission.md) | Redirect URL, click-to-enter, how origins trust tokens   |
| [Architecture](docs/architecture.md)               | Understand Workers / DO / KV choices and cost rules      |
| [API](docs/api.md)                                 | Integrate `/join`, `/status`, tokens, operator routes    |
| [Admin](docs/admin.md)                             | Wizard, team invites, audit log, branding, traffic       |
| [Analytics](docs/analytics.md)                     | Control-room charts (queue depth, wait, geo hits)        |
| [IP allowlist](docs/ip-allowlist.md)               | Staff bypass + Pass queue + Cloudflare access helper     |
| [Country block](docs/geo-block.md)                 | Temporary geo gate via `CF-IPCountry`                    |
| [Load testing](docs/load-testing.md)               | Prove FIFO / lottery behavior at 1k–100k simulated users |
| [Security](SECURITY.md)                            | Secrets, tokens, and what not to put in git              |

## Quick start (local)

```bash
git clone https://github.com/TideGuard/TideGuard.git
cd TideGuard
npm install
npm run setup   # types + .dev.vars TOKEN_SECRET + handoff (optional: starts dev)
# then open http://localhost:8787/admin
```

| URL                          | Purpose                                              |
| ---------------------------- | ---------------------------------------------------- |
| http://localhost:8787        | Landing (redirects to `/admin` until setup)          |
| http://localhost:8787/wait   | Waiting room                                         |
| http://localhost:8787/demo   | Protected demo (redirects to `/wait` until admitted) |
| http://localhost:8787/admin  | Setup wizard / control room                          |
| http://localhost:8787/cost   | Cost calculator                                      |
| http://localhost:8787/health | Liveness                                             |

```bash
npm run ci              # format, lint, typecheck, tests
npm run test:coverage   # Istanbul line coverage (~80% on src/)
npm run test:load       # in-memory scale test (see docs/load-testing.md)
```

## Configuration

Capacity defaults live in `wrangler.jsonc` under `vars` (Deploy to Cloudflare may show these with defaults). Queue name, admission mode, origin proxy, Cloudflare API token, and Turnstile are configured in `/admin` after deploy — not as Deploy prompts.

| Variable                    | Default      | Meaning                        |
| --------------------------- | ------------ | ------------------------------ |
| `MAX_CONCURRENT_USERS`      | `20`         | Capacity past the waiting room |
| `ADMIT_PER_SECOND`          | `2`          | Steady admission rate          |
| `TOKEN_TTL_SECONDS`         | `600`        | Admission token lifetime       |
| `HEARTBEAT_TIMEOUT_SECONDS` | `180`        | Drop silent waiting visitors   |
| `QUEUE_TIMEOUT_SECONDS`     | `1800`       | Max time in queue              |
| `ENVIRONMENT`               | `production` | Reported by `/health`          |

Optional advanced Worker vars (set in the dashboard if needed; not in the Deploy template):

| Variable               | Default   | Meaning                                       |
| ---------------------- | --------- | --------------------------------------------- |
| `DEFAULT_QUEUE`        | `default` | Fallback queue when none is specified         |
| `ADMISSION_MODE`       | `queue`   | `queue` (FIFO) or `lottery` (prefer `/admin`) |
| `ORIGIN_URL`           | _(empty)_ | Upstream origin for proxy (prefer `/admin`)   |
| `ORIGIN_PROTECT_ALL`   | `true`    | Gate all non-TideGuard paths                  |
| `ORIGIN_PATH_PREFIXES` | _(empty)_ | Prefixes if protect-all is off                |

Advanced (not recommended — disables adaptive waiting-room polling):

| Variable                             | Meaning                                     |
| ------------------------------------ | ------------------------------------------- |
| `WAITING_ROOM_POLL_INTERVAL_MS`      | Fixed status poll interval                  |
| `WAITING_ROOM_HEARTBEAT_INTERVAL_MS` | Fixed heartbeat interval (with fixed polls) |

| Secret         | Purpose                                                         |
| -------------- | --------------------------------------------------------------- |
| `TOKEN_SECRET` | HMAC key for visitor tokens and admin sessions; first-claim key |

Full deploy checklist: [docs/getting-started.md](docs/getting-started.md)

## Project layout

```text
src/
  core/             Types, config, ETA, cost model
  auth/             Admission tokens, admin password + session
  admin/            KV helpers for branding, users, invites, audit
  proxy/            Upstream origin forwarding
  queue/            Pure queue engine + traffic helpers + simulator
  durable-object/   QueueRoom (SQLite + alarms)
  health/           Origin probe + graduated throttle
  routes/           HTTP adapters
  html/             Waiting room, cost calculator, geo block
  demo/             Protected demo page
admin/              React admin SPA (Vite + Mantine → dist/admin)
docs/               Guides (start with docs/README.md)
test/               Vitest + Workers pool tests
```

## Roadmap

- [x] Durable Object waiting room (Queue + Lottery)
- [x] REST API + HMAC admission tokens
- [x] Waiting room, demo, embed mode, cost calculator
- [x] Admin React control room (Mantine + Chart.js) with adaptive max outflow
- [x] Guided setup: Cloudflare verify + Turnstile for admin login
- [x] In-admin Cloudflare controls (proxy/geo, SSL Full strict, custom domains)
- [x] Docs hub (getting started, architecture, API, admin, load testing)
- [x] Configurable origin proxy (gate + forward to upstream)
- [x] Opening schedule, silent pause, origin health throttle
- [x] Multi-admin invites + activity audit log
- [ ] OpenAPI spec
- [ ] Richer operator controls in UI (pause / force-admit)

## Contributing

PRs welcome. Keep the surface small and the story clear. See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
