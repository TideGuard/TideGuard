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

Authoritative state for a **single named queue**. All join, leave, heartbeat, and admit operations for that queue are serialized by the platform. Admission order is either FIFO (**Queue Mode**) or uniform random among waiters (**Lottery Mode**).

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

| Module                  | Role                                                         |
| ----------------------- | ------------------------------------------------------------ |
| `src/core`              | Types, config parsing, ETA, API errors — package-extractable |
| `src/queue`             | Pure queue engine logic                                      |
| `src/durable-object`    | Persistence and RPC surface for `QueueRoom`                  |
| `src/auth`              | Token sign / verify                                          |
| `src/routes`            | HTTP mapping only — thin adapters                            |
| `src/html` / `src/demo` | Presentation                                                 |

Keeping HTTP, crypto, and queue math separate makes the core easier to unit test and eventually publish as an npm package.

## Admission modes

| Mode      | Selection                         | Visitor UI                         |
| --------- | --------------------------------- | ---------------------------------- |
| `queue`   | Oldest `sequence` first (FIFO)    | Position in line + ETA             |
| `lottery` | `ORDER BY RANDOM()` among waiters | Equal odds (`1 / waiting`) + ETA   |

Default: `ADMISSION_MODE` Worker var (`queue`). Operators can switch live with `POST /mode`.

## ETA model (v1)

```text
Queue Mode:   estimatedWaitSeconds = ceil(position / admitPerSecond)
Lottery Mode: estimatedWaitSeconds = ceil(waitingCount / admitPerSecond)
```

The calculator is an interface (`EtaCalculator`) so more advanced estimators can replace the simple model without changing the Durable Object or routes.

## Cost discipline

Cloudflare bills for Worker requests, Durable Object requests/duration, KV operations, and alarms. TideGuard is designed to stay cheap under load:

| Path                            | Strategy                                                                   |
| ------------------------------- | -------------------------------------------------------------------------- |
| Queue join / status / heartbeat | Durable Object only — **no KV writes** on the hot path                     |
| Admission + expiry              | **One alarm per active queue** (~1s). Cleared when the room is idle        |
| Branding / theme admin          | KV **write on Save / wizard finish only**; live preview is client-side |
| Admin password                  | PBKDF2 hash in KV (`admin:config`); session cookie signed with `TOKEN_SECRET` |
| Metrics                         | Computed from DO SQL counts — not mirrored to KV on every change           |
| Status polling                  | Necessary for consistency; keep intervals at 2–3s in the waiting UI        |

Avoid:

- Writing KV on every poll or heartbeat
- Fan-out alarms per visitor
- Storing queue order in KV
- Refreshing branding from KV on every `/status` call (cache on the waiting page)

## QueueRoom responsibilities

- Monotonic `sequence` for Queue Mode FIFO ordering
- Lottery Mode random selection among current waiters
- Immediate admit when capacity is free (and not paused)
- Rate-limited admit ticks via alarm (`admitPerSecond`)
- Immediate promote on `leave` when a slot opens
- Heartbeat + queue-stay expiry for waiters
- Admission TTL expiry to free capacity slots
- Pause / resume and live Queue ↔ Lottery mode switch
