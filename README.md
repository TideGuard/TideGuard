# TideGuard

<p>
  <a href="https://github.com/TideGuard/TideGuard/actions/workflows/ci.yml"><img src="https://github.com/TideGuard/TideGuard/actions/workflows/ci.yml/badge.svg" alt="CI" height="20" /></a>
  <a href="#documentation"><img src="https://img.shields.io/badge/coverage-~76%25-brightgreen" alt="Line coverage ~76%" height="20" /></a>
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

| Feature                        | Why it matters                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| **Durable Object queue**       | Strong consistency for join / leave / admit. KV is not a queue.                                     |
| **Queue Mode or Lottery Mode** | Fair FIFO line, or equal-odds random draw among waiters.                                            |
| **HMAC admission tokens**      | Time-limited access without a session database.                                                     |
| **Waiting room (`/wait`)**     | Branded hold page with heartbeats, optional depth, optional Google Analytics, redirect after admit. |
| **Admin control room**         | React (Mantine) SPA: branding (incl. GA Measurement ID), live metrics, adaptive max outflow.        |
| **One-click deploy**           | `wrangler.jsonc` is Deploy-to-Cloudflare friendly out of the box.                                   |
| **Tested Worker logic**        | ≈76%+ line coverage (`npm run test:coverage`); CI enforces Istanbul thresholds (75% lines/stmts).   |

Visitors land on `/wait`. Operators live in `/admin`. Costs are estimated on `/cost`.

## Extended features

| Feature                     | Why it matters                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| **Origin proxy**            | Sit in front of your site; unauthenticated traffic hits `/wait`, admitted traffic is proxied.       |
| **Traffic controls**        | Opening schedule, silent pause, origin health throttle.                                             |
| **IP allowlist + Pass**     | Staff skip the line; mint a temporary cookie to smoke-test.                                         |
| **Temporary country block** | Event-window geo gate via `CF-IPCountry`.                                                           |
| **Cloudflare from admin**   | Verify API token, fix proxied DNS, toggle IP Geolocation, set Full (strict), manage domains.        |
| **Turnstile on admin auth** | Setup provisions a widget; login and invites require siteverify (not rate limits alone).            |
| **Live traffic**            | Live metrics + 24h inflow/outflow chart + CSV export; geo-block hits.                               |
| **Google Analytics**        | Optional GA4 Measurement ID in Branding; official gtag on `/wait` (consent is your responsibility). |
| **Operator webhooks**       | HTTPS callbacks for pause, health config changes, and waiting-depth thresholds.                     |
| **Cost calculator**         | Ballpark Cloudflare spend before the launch.                                                        |
| **Adaptive max outflow**    | Live admit-rate control + inflow/outflow chart (no redeploy).                                       |
| **Team invites**            | 72-hour invite links for additional admins (no email).                                              |
| **Activity audit log**      | Who turned what on or off in the control room.                                                      |

Deep guides: [custom domain](https://tideguard.dev/docs/custom-domain/), [protecting origin](https://tideguard.dev/docs/protecting-origin/) (including Authenticated Origin Pulls), [admin](https://tideguard.dev/docs/admin/), [upgrading](https://tideguard.dev/docs/upgrading/).

## Documentation

Operator guides are authored in this repo under `docs/` and published at [tideguard.dev/docs](https://tideguard.dev/docs/).

| Guide                                                                                                             | Start here if you want to…                                                      |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [Getting started](docs/getting-started.md) · [web](https://tideguard.dev/docs/getting-started/)                   | Clone, run locally, deploy, first `/admin` setup                                |
| [Upgrading](docs/upgrading.md) · [web](https://tideguard.dev/docs/upgrading/)                                     | Update an existing deploy without losing KV / secrets                           |
| [Launch checklist](docs/launch-checklist.md) · [web](https://tideguard.dev/docs/launch-checklist/)                | Pre-production go-live review                                                   |
| [Custom domain](docs/custom-domain.md) · [web](https://tideguard.dev/docs/custom-domain/)                         | Full NS setup or partial CNAME (Business) to put TideGuard on a hostname        |
| [Protecting a domain](docs/protecting-origin.md) · [web](https://tideguard.dev/docs/protecting-origin/)           | Origin proxy, AOP, Cloudflare in front of origin                                |
| [Verifying admission](docs/verifying-admission.md) · [web](https://tideguard.dev/docs/verifying-admission/)       | Redirect URL, click-to-enter, how origins trust tokens                          |
| [Architecture](docs/architecture.md) · [web](https://tideguard.dev/docs/architecture/)                            | Understand Workers / DO / KV choices and cost rules                             |
| [API](docs/api.md) · [web](https://tideguard.dev/docs/api/)                                                       | Integrate `/join`, `/status`, tokens, operator routes ([OpenAPI](openapi.yaml)) |
| [Admin](docs/admin.md) · [web](https://tideguard.dev/docs/admin/)                                                 | Wizard, team invites, audit log, branding (incl. Google Analytics), traffic     |
| [Analytics](docs/analytics.md) · [web](https://tideguard.dev/docs/analytics/)                                     | Live metrics + 24h traffic chart / CSV export                                   |
| [IP allowlist](docs/ip-allowlist.md) · [web](https://tideguard.dev/docs/ip-allowlist/)                            | Staff bypass + Pass queue + Cloudflare access helper                            |
| [Country block](docs/geo-block.md) · [web](https://tideguard.dev/docs/geo-block/)                                 | Temporary geo gate via `CF-IPCountry`                                           |
| [Operator webhooks](docs/webhooks.md) · [web](https://tideguard.dev/docs/webhooks/)                               | Pause / health / depth HTTPS callbacks                                          |
| [TOKEN_SECRET rotation](docs/token-secret-rotation.md) · [web](https://tideguard.dev/docs/token-secret-rotation/) | Rotate the master secret safely                                                 |
| [Load testing](docs/load-testing.md) · [web](https://tideguard.dev/docs/load-testing/)                            | Prove FIFO / lottery behavior at 1k–100k simulated users                        |
| [Security](SECURITY.md)                                                                                           | Secrets, tokens, and what not to put in git                                     |

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
npm run test:coverage   # Istanbul coverage with CI thresholds (~75% lines on src/)
npm run test:load       # in-memory scale test (see docs/load-testing.md)
npm run rotate:token-secret  # generate TOKEN_SECRET + rotation checklist
```

## Configuration

Queue capacity, admit rate, and timeouts default in code (`DEFAULT_QUEUE_CONFIG`). Optional wrangler `vars` overrides (not prompted on Deploy-to-Cloudflare). Queue name, admission mode, origin proxy, Cloudflare API token, and Turnstile are configured in `/admin` after deploy.

| Variable                    | Default      | Meaning                                                                                       |
| --------------------------- | ------------ | --------------------------------------------------------------------------------------------- |
| `MAX_CONCURRENT_USERS`      | `20`         | Capacity past the waiting room                                                                |
| `ADMIT_PER_SECOND`          | `2`          | Steady admission rate                                                                         |
| `TOKEN_TTL_SECONDS`         | `600`        | Admission token lifetime                                                                      |
| `HEARTBEAT_TIMEOUT_SECONDS` | `180`        | Drop silent waiting visitors (legacy / null timeslot rows)                                    |
| `QUEUE_TIMEOUT_SECONDS`     | `86400`      | Max time in queue (24h)                                                                       |
| `MISSED_SLOT_GRACE_SECONDS` | `120`        | Seconds after due timeslot before silent waiters expire (30–900; prefer `/admin` Danger zone) |
| `ENVIRONMENT`               | `production` | Reported by `/health`                                                                         |

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
- [x] OpenAPI spec
- [x] Richer operator controls in UI (pause / force-admit / sticky event toolbar)
- [x] Demo mode (smoke-test `/demo` without gating origin; Go live)
- [x] BIP39 English admin recovery phrase (Turnstile on forgot-password)
- [x] Rolling-throughput ETA (blend setpoint with recent admits)
- [x] 24h traffic retention + CSV export
- [x] TOKEN_SECRET rotation guide + `npm run rotate:token-secret`
- [x] Cloudflare Access guidance for `/admin`
- [x] Operator webhooks (pause / health / depth)
- [x] Waiting-room embed height postMessage + a11y / i18n hooks

## Contributing

PRs welcome. Keep the surface small and the story clear.

- Humans: [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md)
- AI assistants: [AGENTS.md](AGENTS.md) (canonical repo + how to contribute without drifting from upstream)

Canonical project: [github.com/TideGuard/TideGuard](https://github.com/TideGuard/TideGuard) · [tideguard.dev](https://tideguard.dev). If you deployed from a fork, keep an `upstream` remote and follow [docs/upgrading.md](docs/upgrading.md).

## License

[MIT](LICENSE)
