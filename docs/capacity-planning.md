# Capacity planning

TideGuard is in **public beta**. Treat the numbers below as **conservative recommendations and planning aids**, not guaranteed hard limits or Cloudflare platform ceilings.

## One queue = one Durable Object

Each named TideGuard queue is handled by **one Durable Object instance**.

Requests for that queue (join, status, heartbeat, admit, metrics, alarms) are coordinated by that object. JavaScript execution for a single Durable Object is effectively **single-threaded** for the work that object performs; storage operations add further serialization. Practical throughput therefore depends on:

- Request complexity (JSON validation, token crypto, SQLite reads/writes)
- Status polling and heartbeat intervals
- Join bursts and admission work
- Alarm sweeps and origin health probes
- Cloudflare Durable Object soft throughput guidance for your operation mix

Cloudflare documents approximate single-DO ranges on the order of hundreds to ~1,000 requests/second for simple work, less for heavier storage paths. **TideGuard does not treat those figures as hard limits** and does not promise them for every deployment.

## Background load model

While visitors wait, each client roughly generates:

```text
background_requests_per_user_per_second =
    1 / status_poll_interval_seconds
  + 1 / heartbeat_interval_seconds

estimated_background_rps =
    concurrent_waiting_users
  * background_requests_per_user_per_second
```

### Defaults (TideGuard waiting UI)

| Interval    | Default |
| ----------- | ------- |
| Status poll | **15s** |
| Heartbeat   | **30s** |

```text
per-user background RPS = 1/15 + 1/30 = 0.1 RPS
```

### Examples (background only)

| Concurrent waiting users | Estimated background RPS |
| ------------------------ | ------------------------ |
| 1,000                    | ≈ 100                    |
| 5,000                    | ≈ 500                    |
| 10,000                   | ≈ 1,000                  |

These examples **do not include**:

- Initial join requests
- Admission / force-admit traffic
- Admin operations
- Retries and reconnect storms
- Origin health checks
- Traffic bursts at open
- Extra API clients or embeds

## Conservative recommendation

With the default **15-second** status polling and **30-second** heartbeat intervals, TideGuard recommends keeping a **single queue below approximately 5,000 concurrently waiting clients** until the deployment has been **benchmarked under representative production conditions**.

That is a **recommendation**, not an absolute limit. Your code path, storage shape, and Cloudflare limits may allow more or less.

Use `/cost` for both **spend** and **Estimated queue load** (peak RPS risk bands). Risk thresholds live in `QUEUE_CAPACITY_THRESHOLDS` (`src/core/queue-load.ts`) as planning constants — not platform guarantees.

## Ways to reduce load

1. **Longer status poll intervals** (largest lever for background RPS)
2. **Adaptive polling** (slower while far from the front; faster near admit)
3. **Lower heartbeat frequency** (must stay under `HEARTBEAT_TIMEOUT_SECONDS`)
4. **Queue sharding** — split events across multiple named queues / Durable Objects
5. **Separate queues per drop / SKU / region** instead of one global line
6. **Load-test a real Cloudflare deployment** (not only in-memory simulators) before critical events — see [load-testing.md](load-testing.md)

## Known limitations (beta)

- Production throughput has not been verified for every traffic pattern.
- A single queue currently uses one Durable Object.
- Large deployments require representative load testing.
- APIs and configuration may change before version 1.0.
- The open-source project does not include a managed SLA.
- TideGuard does not replace bot protection, identity verification, or a WAF.

## Related

- [Launch checklist](launch-checklist.md)
- [Architecture](architecture.md)
- [Load testing](load-testing.md)
- Cost UI: `/cost` · API: `/api/cost-estimate`
