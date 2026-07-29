# TideGuard

<p>
  <a href="https://github.com/TideGuard/TideGuard/actions/workflows/ci.yml"><img src="https://github.com/TideGuard/TideGuard/actions/workflows/ci.yml/badge.svg" alt="CI" height="20" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" height="20" /></a>
</p>

<p>
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/TideGuard/TideGuard"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" height="36" /></a>
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

| You get                        | Why it matters                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| **Durable Object queue**       | Strong consistency for join / leave / admit. KV is not a queue.                               |
| **Queue Mode or Lottery Mode** | Fair FIFO line, or equal-odds random draw among waiters.                                      |
| **HMAC admission tokens**      | Time-limited access without a session database.                                               |
| **Admin control room**         | Branding, traffic controls, live queue metrics, and analytics with live preview.              |
| **Origin proxy**               | Sit in front of your site; unauthenticated traffic hits `/wait`, admitted traffic is proxied. |
| **IP allowlist + Pass queue**  | Staff skip the line from a fixed network, or mint a temporary cookie to smoke-test.           |
| **Temporary country block**    | Event-window geo gate via `CF-IPCountry`, with TTL and allowlist overrides.                   |
| **Cost calculator**            | Ballpark Cloudflare spend before the launch, not after the invoice.                           |
| **One-click deploy**           | `wrangler.jsonc` is Deploy-to-Cloudflare friendly out of the box.                             |

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
- Configurable **redirect path** after admission (or `?return=` on `/wait`)
- Optional **click-to-enter**: a Continue button plus a hold timer before the spot is released

Depth stats are off by default. Turn them on in admin (`showWaitingCount`).

## Traffic controls

Operators pace launches from `/admin` (Traffic panel) and the operator API:

| Control           | Visitors see                              | Operators see              |
| ----------------- | ----------------------------------------- | -------------------------- |
| **Opening time**  | Countdown on `/wait` only                 | Schedule panel             |
| **Silent pause**  | Normal waiting UI; admissions stop        | Pause toggle + metrics     |
| **Origin health** | Normal waiting UI; rate cut or auto-pause | Health status + last probe |

Admission rule (shared by join, alarm, and force-admit):

```text
canAdmit = !manualPause && !autoPause && now >= opensAt
admitRate = baseAdmitPerSecond × healthMultiplier   // 1.0 | slowFactor | 0
```

**Same browser, multiple tabs:** one seat — `POST /join` resumes the existing `tg_ticket` visitor and ignores a conflicting body `visitorId`.

**Different browsers / devices:** each profile can take its own seat. TideGuard paces capacity; it is not a bot or identity system. Operators who need stronger limits can lower capacity, use Lottery Mode, put Cloudflare Bot Fight/WAF in front, or require login before `/wait`.

Details: [docs/admin.md](docs/admin.md), [docs/verifying-admission.md](docs/verifying-admission.md).

## Operator tools

The `/admin` control room is the launch desk:

| Tool                  | What it does                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Live queue**        | Waiting, admitted, open slots, wait times, geo-block hits — refreshed about every 5s                        |
| **Analytics**         | 5-minute charts for queue depth, average wait, and country-block hits (1h / 12h / 24h)                      |
| **IP allowlist**      | Office / staff IPs skip the queue without consuming capacity ([docs/ip-allowlist.md](docs/ip-allowlist.md)) |
| **Pass queue**        | Issue an admission cookie for this browser to smoke-test the protected app                                  |
| **Country block**     | Temporary `CF-IPCountry` gate with TTL for event windows ([docs/geo-block.md](docs/geo-block.md))           |
| **Cloudflare access** | Optional Zone ID + API token to check/fix proxied DNS and IP Geolocation                                    |
| **Updates**           | Shows running version; checks GitHub Releases for a newer tag ([docs/upgrading.md](docs/upgrading.md))       |
| **Origin proxy**      | Gate paths and forward admitted traffic upstream ([docs/protecting-origin.md](docs/protecting-origin.md))   |

Analytics chart history is kept in the operator’s browser while the control room is open — no server-side time-series store. Details: [docs/analytics.md](docs/analytics.md).

How your origin trusts admitted visitors: [docs/verifying-admission.md](docs/verifying-admission.md).

## Architecture (short version)

```text
Browser
  │
  ▼
Worker          routing · tokens · HTML · geo/IP gates · validation
  │
  ├─► QueueRoom (Durable Object)   authoritative waiting pool
  └─► CONFIG_KV                    branding · admin · allowlist · geo block
```

One Durable Object instance per queue name. One alarm per active queue for rate-limited admission and expiry. **No KV writes on join, status, or heartbeat.** That is the cost discipline.

Deep dive: [docs/architecture.md](docs/architecture.md)

## Documentation

| Guide                                              | Start here if you want to…                               |
| -------------------------------------------------- | -------------------------------------------------------- |
| [Getting started](docs/getting-started.md)         | Clone, run locally, deploy, first `/admin` setup         |
| [Upgrading](docs/upgrading.md)                     | Update an existing deploy without losing KV / secrets    |
| [Launch checklist](docs/launch-checklist.md)       | Pre-production go-live review                            |
| [Protecting a domain](docs/protecting-origin.md)   | Custom domains, routes, Cloudflare in front of origin    |
| [Verifying admission](docs/verifying-admission.md) | Redirect URL, click-to-enter, how origins trust tokens   |
| [Architecture](docs/architecture.md)               | Understand Workers / DO / KV choices and cost rules      |
| [API](docs/api.md)                                 | Integrate `/join`, `/status`, tokens, operator routes    |
| [Admin](docs/admin.md)                             | Wizard, login, branding, traffic, live queue, analytics  |
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
| `ORIGIN_URL`                | _(empty)_    | Upstream origin for proxy      |
| `ORIGIN_PROTECT_ALL`        | `true`       | Gate all non-TideGuard paths   |
| `ORIGIN_PATH_PREFIXES`      | _(empty)_    | Prefixes if protect-all is off |
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
  admin/            KV helpers for branding, setup, origin proxy
  proxy/            Upstream origin forwarding
  queue/            Pure queue engine + in-memory load simulator
  durable-object/   QueueRoom (SQLite + alarms)
  health/           Origin probe + graduated throttle
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
- [x] Configurable origin proxy (gate + forward to upstream)
- [x] Opening schedule, silent pause, origin health throttle
- [ ] OpenAPI spec
- [ ] Richer operator controls in UI (pause / force-admit)

## Contributing

PRs welcome. Keep the surface small and the story clear. See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
