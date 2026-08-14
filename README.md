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

When a launch, drop, or ticket sale spikes traffic, TideGuard puts visitors in a calm virtual line (or a lottery pool), then lets them through with signed access tokens. It runs on Cloudflare Workers, Durable Objects, and KV — cheap to run, ready to deploy.

```text
Spike hits → waiting room → controlled admit → signed token → protected page
```

Commercial waiting rooms work. They are also expensive, opaque, and hard to study. TideGuard is the opposite shape: open source, edge-native, and designed so you can read the queue logic.

Visitors land on `/wait`. Operators live in `/admin`. Costs are estimated on `/cost`.

## Waiting room

| Feature                 | What you get                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| **Virtual line**        | Branded `/wait` page (full page or embed). Place and ETA when you want them shown; admit at your rate. |
| **Queue or lottery**    | Fair first-come line, or equal-odds draw among people waiting.                                         |
| **Admission tickets**   | Short-lived signed tokens so the protected page or origin knows who was let through.                   |
| **Demo before go-live** | Smoke-test `/demo` until you enable origin protection.                                                 |

## Running the event

| Feature                 | What you get                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| **Control room**        | Pause, change admit rate, force-admit, watch live metrics — from `/admin`, without redeploying.    |
| **Schedule and health** | Open at a set time, pause the room, throttle if origin health drops.                               |
| **Team**                | Invite co-operators so more than one person can run the room.                                      |
| **Activity log**        | Who changed pause, rate, proxy, and other controls.                                                |
| **Staff access**        | IP allowlist and a temporary Pass so your team can skip the line and smoke-test.                   |
| **Country gate**        | Temporarily block countries for the event window.                                                  |
| **Traffic history**     | 24h inflow/outflow chart and CSV export.                                                           |
| **Branding**            | Colors, copy, optional place-in-line, optional Google Analytics on `/wait`.                        |
| **Webhooks**            | HTTPS callbacks when the room pauses, health config changes, or waiting depth crosses a threshold. |
| **Cost estimate**       | Ballpark Cloudflare spend on `/cost` before you launch.                                            |

## Origin and Cloudflare

| Feature                   | What you get                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Origin proxy**          | Unauthenticated traffic hits the waiting room; admitted traffic is forwarded to your site.           |
| **Zone from admin**       | After a one-time API token: DNS/proxy checks, SSL, custom domains — without living in the dashboard. |
| **Protected admin login** | Turnstile on sign-in, provisioned during setup.                                                      |
| **One-click deploy**      | Deploy-to-Cloudflare; `wrangler.jsonc` is ready.                                                     |

Deep guides: [custom domain](https://tideguard.dev/docs/custom-domain/), [protecting origin](https://tideguard.dev/docs/protecting-origin/) (including Authenticated Origin Pulls), [admin](https://tideguard.dev/docs/admin/), [upgrading](https://tideguard.dev/docs/upgrading/).

## Documentation

Operator guides are authored in this repo under `docs/` and published at [tideguard.dev/docs](https://tideguard.dev/docs/).

| Guide                                                                                                             | Start here if you want to…                                                |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [Getting started](docs/getting-started.md) · [web](https://tideguard.dev/docs/getting-started/)                   | Deploy or run locally, then claim `/admin`                                |
| [Upgrading](docs/upgrading.md) · [web](https://tideguard.dev/docs/upgrading/)                                     | Update an existing deploy without losing config or secrets                |
| [Launch checklist](docs/launch-checklist.md) · [web](https://tideguard.dev/docs/launch-checklist/)                | Pre-production go-live review                                             |
| [Custom domain](docs/custom-domain.md) · [web](https://tideguard.dev/docs/custom-domain/)                         | Put TideGuard on your hostname                                            |
| [Protecting a domain](docs/protecting-origin.md) · [web](https://tideguard.dev/docs/protecting-origin/)           | Sit in front of your origin (proxy, Authenticated Origin Pulls)           |
| [Verifying admission](docs/verifying-admission.md) · [web](https://tideguard.dev/docs/verifying-admission/)       | How your origin trusts admitted visitors                                  |
| [Architecture](docs/architecture.md) · [web](https://tideguard.dev/docs/architecture/)                            | How Workers, Durable Objects, and KV fit together                         |
| [API](docs/api.md) · [web](https://tideguard.dev/docs/api/)                                                       | Integrate join, status, tokens, operator routes ([OpenAPI](openapi.yaml)) |
| [Admin](docs/admin.md) · [web](https://tideguard.dev/docs/admin/)                                                 | Set up `/admin`, invite operators, branding, traffic                      |
| [Analytics](docs/analytics.md) · [web](https://tideguard.dev/docs/analytics/)                                     | Watch live traffic and export 24h history                                 |
| [IP allowlist](docs/ip-allowlist.md) · [web](https://tideguard.dev/docs/ip-allowlist/)                            | Let staff skip the line                                                   |
| [Country block](docs/geo-block.md) · [web](https://tideguard.dev/docs/geo-block/)                                 | Temporarily block countries for the event                                 |
| [Operator webhooks](docs/webhooks.md) · [web](https://tideguard.dev/docs/webhooks/)                               | Notify your tools when the room pauses or fills                           |
| [TOKEN_SECRET rotation](docs/token-secret-rotation.md) · [web](https://tideguard.dev/docs/token-secret-rotation/) | Rotate the master secret safely                                           |
| [Load testing](docs/load-testing.md) · [web](https://tideguard.dev/docs/load-testing/)                            | Prove queue behavior at scale                                             |
| [Security](SECURITY.md)                                                                                           | Secrets, tokens, and what not to put in git                               |

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

Operator:

```bash
npm run rotate:token-secret  # generate TOKEN_SECRET + rotation checklist
```

Contributor:

```bash
npm run ci              # format, lint, typecheck, tests
npm run test:coverage   # coverage with CI thresholds (~75% lines on src/)
npm run test:load       # in-memory scale test (see docs/load-testing.md)
```

## Configuration

Most live settings — queue name, admission mode, origin proxy, Cloudflare, Turnstile — are configured in `/admin` after deploy. The tables below are code defaults and optional Worker `vars` overrides (not prompted on Deploy-to-Cloudflare).

| Variable                    | Default      | Meaning                                                                                  |
| --------------------------- | ------------ | ---------------------------------------------------------------------------------------- |
| `MAX_CONCURRENT_USERS`      | `20`         | Capacity past the waiting room                                                           |
| `ADMIT_PER_SECOND`          | `2`          | Steady admission rate                                                                    |
| `TOKEN_TTL_SECONDS`         | `600`        | Admission token lifetime                                                                 |
| `HEARTBEAT_TIMEOUT_SECONDS` | `180`        | Drop silent waiting visitors                                                             |
| `QUEUE_TIMEOUT_SECONDS`     | `86400`      | Max time in queue (24h)                                                                  |
| `MISSED_SLOT_GRACE_SECONDS` | `120`        | Seconds after a missed check-in before a silent waiter expires (30–900; prefer `/admin`) |
| `ENVIRONMENT`               | `production` | Reported by `/health`                                                                    |

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

| Secret         | Purpose                                                   |
| -------------- | --------------------------------------------------------- |
| `TOKEN_SECRET` | Signs visitor tickets and admin sessions; first-claim key |

Full deploy checklist: [docs/getting-started.md](docs/getting-started.md)

## Project layout

Source map for people who clone the repo — not the product.

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
packages/verify/    npm extract for server-side admission-token verification
docs/               Guides (start with docs/README.md)
test/               Vitest + Workers pool tests
```

## Releases

Shipped work lives in [CHANGELOG.md](CHANGELOG.md) and [GitHub Releases](https://github.com/TideGuard/TideGuard/releases). Planned work lives in [ROADMAP.md](ROADMAP.md) — do not treat the changelog as a roadmap.

## Contributing

PRs welcome. Keep the surface small and the story clear.

- Humans: [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md)
- AI assistants: [AGENTS.md](AGENTS.md) (canonical repo + how to contribute without drifting from upstream)

Canonical project: [github.com/TideGuard/TideGuard](https://github.com/TideGuard/TideGuard) · [tideguard.dev](https://tideguard.dev). If you deployed from a fork, keep an `upstream` remote and follow [docs/upgrading.md](docs/upgrading.md).

## License

[MIT](LICENSE)
