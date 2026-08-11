# Architecture

How TideGuard uses Cloudflare Workers, Durable Objects, and KV, and why those choices keep admission correct and costs predictable.

If you only need deploy steps, start with [getting-started.md](getting-started.md).

## System overview

```text
Browser
     │
     ▼
Cloudflare Worker
     │
 ┌─────────────┐
 │ Durable Obj │  QueueRoom (one instance per queue name)
 └─────────────┘
     │
     ▼
Cloudflare KV     Config / branding / optional metrics snapshots
```

## Request lifecycle (target design)

```text
Visitor
  │
  ▼
Worker
  │
  ▼
Valid admission token?
  │
  ├─ yes → Protected demo / origin
  │
  └─ no  → QueueRoom Durable Object
              │
              ├─ under capacity → admit + sign token
              └─ at capacity    → waiting room HTML
                                    │
                                    ▼
                                 poll /status
                                    │
                                    ▼
                                 admit + token
```

## Why each Cloudflare service

### Worker

Stateless request handling at the edge: routing, input validation, HTML responses, and cryptographic token checks. Workers scale horizontally without holding queue order in memory.

### Durable Object (`QueueRoom`)

Authoritative state for a **single named queue**. All join, leave, status, heartbeat, and admit operations for that queue are serialized by the platform. Admission order is either FIFO (**Queue Mode**) or uniform random among waiters (**Lottery Mode**).

Prefer Durable Objects over KV here because:

1. **Consistency** — DO storage is strongly consistent for that object.
2. **Coordination** — concurrent visitors cannot race on position assignment.
3. **Alarms** — periodic cleanup of expired / silent visitors without an external cron.

### KV (`CONFIG_KV`)

Eventually consistent, globally fast key-value storage. Suitable for:

- Per-queue configuration overrides
- Branding / waiting-room copy
- Cached metrics for dashboards (non-authoritative)

Unsuitable for queue membership or ordering.

## Module boundaries

| Module                  | Role                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/core`              | Types, config parsing, ETA, API errors — package-extractable                                                        |
| `src/queue`             | Pure queue engine logic                                                                                             |
| `src/health`            | Origin probe helpers + graduated throttle state machine                                                             |
| `src/durable-object`    | `QueueRoom` RPC + SQLite helpers (`visitor-sql`, traffic buckets, health state, schema)                             |
| `src/auth`              | Tokens, sessions, passwords, access gates; shared `crypto.ts` HMAC/base64url primitives                             |
| `src/admin`             | KV stores (config, branding, bypass, geo, Turnstile, invites, audit), Cloudflare API client, operator error mapping |
| `src/routes`            | HTTP mapping — thin adapters (`admin/*`, queue, pages)                                                              |
| `src/html` / `src/demo` | Presentation (waiting room, cost, geo block)                                                                        |
| `admin/`                | React admin SPA (Vite + Mantine + Chart.js → Static Assets)                                                         |

Keeping HTTP, crypto, and queue math separate makes the core easier to unit test and eventually publish as an npm package.

Runtime **admit rate overrides** and **traffic buckets** live in QueueRoom SQLite (`admit_per_second_override`, `traffic_buckets`), not KV. Env `ADMIT_PER_SECOND` remains the default when no override is set.

## Admission modes

| Mode      | Selection                                                                                      | Visitor UI                                                            |
| --------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `queue`   | Oldest `sequence` first (FIFO)                                                                 | Position in line + ETA                                                |
| `lottery` | Uniform index sample (`OFFSET`) among waiters; large admin batches may use `ORDER BY RANDOM()` | Equal chance + ETA (optional pool size); API may expose `lotteryOdds` |

Default: `ADMISSION_MODE` Worker var (`queue`). Operators can switch live with `POST /mode`.

## ETA model (v1.5)

```text
Queue Mode:   estimatedWaitSeconds = ceil(position / effectiveRate)
Lottery Mode: estimatedWaitSeconds = ceil(waitingCount / effectiveRate)
```

`effectiveRate` starts as the configured admit setpoint. When recent traffic buckets show observed admits, TideGuard blends setpoint with observed throughput (never faster than the setpoint) via `RollingThroughputEtaCalculator`. The calculator is an interface (`EtaCalculator`) so estimators can be swapped without changing routes.

## Cost discipline

Cloudflare bills for Worker requests, Durable Object requests/duration, KV operations, and alarms. TideGuard is designed to stay cheap under load:

| Path                            | Strategy                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------- |
| Queue join / status / heartbeat | Durable Object only — **no KV writes** on the hot path                        |
| Admission + expiry              | **One alarm per active queue** (~1s). Cleared when the room is idle           |
| Branding / theme admin          | KV **write on Save / wizard finish only**; live preview is client-side        |
| Admin password                  | PBKDF2 hash in KV (`admin:config`); session cookie signed with `TOKEN_SECRET` |
| Admin users                     | Named accounts in `admin:config.users[]`; invites hashed with 72h TTL         |
| Activity audit                  | KV ring `admin:audit` (~200 events); no secrets                               |
| Metrics                         | Cached DO depth counters (reconciled on sweep) — not mirrored to KV           |
| Status polling                  | Timeslots (`nextCheckAt`); early status is read-only; density ≤ ~750/s; deferred until `opensAt` when scheduled |
| Heartbeat                       | Due status renews liveness; dedicated `/heartbeat` is fallback for long gaps  |
| Missed-slot expiry              | After `nextCheckAt` + grace (default 120s, admin 30…900; ≥ one period)        |

Avoid:

- Writing KV on every poll or heartbeat
- Fan-out alarms per visitor
- Storing queue order in KV
- Refreshing branding from KV on every `/status` call (cache on the waiting page)

## Admission gates

Join, alarm ticks, and force-admit share one rule in `QueueRoom`:

```text
canAdmit = !manualPause && !autoPause && now >= opensAt
admitRate = baseAdmitPerSecond × healthRateMultiplier   // 1.0 | slowFactor | 0
```

| Control       | Persistence                                           | Visitor surface                           |
| ------------- | ----------------------------------------------------- | ----------------------------------------- |
| `opensAt`     | DO meta                                               | Countdown / “Queue is open” on `/wait`; floors `nextCheckAt`; public API exposes `admissionOpen` + `opensAt` while closed |
| Manual pause  | DO meta                                               | Silent — no join/status fields            |
| Origin health | DO meta + alarm probes (`src/health/origin-probe.ts`) | Silent; ops via admin / `/metrics`        |

Public `/join` / `/status` omit depth unless `showWaitingCount` is synced to the DO. `GET /metrics` is operator-auth only.

Same-browser multi-tab: `POST /join` resumes a valid `tg_ticket` and ignores a conflicting body `visitorId`.

## QueueRoom responsibilities

- Monotonic `sequence` for Queue Mode FIFO ordering
- Lottery Mode random selection among current waiters
- Immediate admit when capacity is free (and gates allow)
- Rate-limited admit ticks via alarm (`admitPerSecond` × health multiplier)
- Immediate promote on `leave` when a slot opens
- Heartbeat + queue-stay expiry for waiters
- Admission TTL expiry to free capacity slots
- Opening schedule, silent pause / resume, origin health throttle
- Live Queue ↔ Lottery mode switch
