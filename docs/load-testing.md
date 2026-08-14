# Load testing

Prove queue behavior from hundreds to 100k users without paying Cloudflare for every experiment.

For product overview, see the [README](../README.md). For Durable Object semantics, see [architecture.md](architecture.md).

## In-memory scale test (recommended)

Runs a pure TypeScript queue that mirrors Durable Object semantics (capacity, FIFO, rate-limited admit). Fast enough for 100k users on a laptop.

```bash
# defaults to 1000 users
npm run test:load

LOAD_TEST_USERS=100 npm run test:load
LOAD_TEST_USERS=500 npm run test:load
LOAD_TEST_USERS=1000 npm run test:load
LOAD_TEST_USERS=5000 npm run test:load
LOAD_TEST_USERS=100000 npm run test:load
```

Optional knobs:

| Env var                      | Default | Meaning                            |
| ---------------------------- | ------- | ---------------------------------- |
| `LOAD_TEST_USERS`            | `1000`  | Visitors to enqueue                |
| `LOAD_TEST_CAPACITY`         | `20`    | Concurrent admitted slots          |
| `LOAD_TEST_ADMIT_PER_SECOND` | `100`   | Admission rate used while draining |

The test asserts:

1. First `capacity` joins are admitted immediately
2. Remaining visitors wait in FIFO order
3. Positions are 1-based and stable
4. Drain via leave+tick never skips ahead in line

## Durable Object load smoke test (opt-in)

Exercises real `QueueRoom` RPC/SQLite. Each join is a DO request, so keep N modest unless you intentionally want a long run.

```bash
RUN_DO_LOAD=1 LOAD_TEST_USERS=200 npm run test:load:do
RUN_DO_LOAD=1 LOAD_TEST_USERS=500 LOAD_TEST_CAPACITY=20 npm run test:load:do
```

Notes:

- Full `npm test` excludes `test/load/**`
- CI runs a small **in-memory** smoke (`LOAD_TEST_USERS=50`) on every PR via the `load-smoke` job
- 100k **DO** joins will be slow and burn CPU; prefer in-memory for that scale
- Production cost still hinges on timeslot status check-ins (≈750 RPS budget) and idle alarm cleanup

## Interpreting results

The in-memory suite prints a JSON summary:

```json
{
  "users": 5000,
  "capacity": 20,
  "admitPerSecond": 100,
  "ticks": 50,
  "elapsedMs": 42,
  "joinsPerSecond": 119047
}
```

Use that to compare machines and algorithms, not as a Cloudflare billing estimate. Billing is dominated by Worker/DO requests from real browsers, which is why the waiting room polls slowly and never writes KV on the hot path.

## Staging against Cloudflare

Deploy a non-production Worker with Wrangler, use a dedicated queue name, and keep its limits below production:

```bash
npx wrangler deploy
export BASE_URL=https://your-staging-worker.example.workers.dev
export QUEUE=load-$(date +%s)
```

Exercise `/join`, retain each response cookie and visitor ID, then call `/status?queue=$QUEUE&id=...` at the returned `nextCheckAt`. k6 is convenient for cookie jars and staged arrival rates; Vegeta is useful for a simpler fixed-rate `/join` run. Ramp gradually, watch Durable Object errors/duration, and stop before the queue's configured waiting cap.

Use one queue per test run so old visitors do not affect depth. Do not aim an unauthenticated load generator at production, and do not send fixed-rate `/status` traffic that ignores `nextCheckAt`: that measures an abusive client rather than TideGuard's adaptive protocol.

The in-memory benchmark proves algorithmic behavior only. It does **not** reproduce Cloudflare Durable Object scheduling, SQLite I/O, network latency, request limits, or billing. A staging Worker is required for those observations.
