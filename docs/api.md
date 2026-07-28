# API

Base URL is your Worker hostname (local: `http://localhost:8787`).

All JSON error responses use:

```json
{
  "error": {
    "code": "bad_request",
    "message": "Human readable message",
    "details": {}
  }
}
```

## Endpoints

### `GET /health`

Liveness check.

### `POST /join`

Enter a queue.

```json
{ "queue": "product-launch", "visitorId": "optional-id" }
```

- `200` — admitted immediately (includes `accessToken`)
- `202` — waiting

Waiting responses always include `admissionMode` (`queue` | `lottery`):

- **Queue Mode** — `position` (1-based FIFO), `ahead` (`position - 1`), `behind` (`waiting - position`), `estimatedWaitSeconds`
- **Lottery Mode** — `position` / `ahead` / `behind` omitted, `lotteryOdds` is `1 / waitingCount`, `waiting` is the lottery pool size

Both modes include `waiting` (current waiting-room depth). The waiting-room UI only displays depth details when branding `showWaitingCount` is true, or when `?showWaiting=1` is set on `/wait`:

- Lottery → **In pool**
- Queue → **Ahead** and **Behind**

### `GET /status?queue=…&id=…`

Current visitor status. When `status` is `admitted`, response includes `accessToken`.
Same `admissionMode` / `position` / `lotteryOdds` fields as `/join`.

### `POST /leave`

```json
{ "queue": "product-launch", "visitorId": "…" }
```

### `POST /heartbeat`

Keep a waiting visitor alive.

```json
{ "queue": "product-launch", "visitorId": "…" }
```

### `POST /admit`

Operator-only: admit up to `count` waiters into open slots, ignoring the rate budget but still respecting pause/capacity. Selection follows the room’s admission mode (FIFO in Queue Mode, random in Lottery Mode).

Auth:

- Admin session cookie `tg_admin`, or
- `Authorization: Bearer <TOKEN_SECRET>`, or
- `X-TideGuard-Operator: <TOKEN_SECRET>`

```json
{ "queue": "product-launch", "count": 2 }
```

### `POST /mode`

Operator-only: switch admission strategy for a queue at runtime.

```json
{ "queue": "product-launch", "mode": "lottery" }
```

`mode` must be `"queue"` (FIFO line) or `"lottery"` (uniform random among waiters). Default comes from `ADMISSION_MODE` in Worker vars.

### `GET /metrics?queue=…`

Queue depth, capacity, ETA, pause state, and `admissionMode`. Computed in the Durable Object (no KV write).

### Cost estimate

`GET /api/cost-estimate`

Query params:

| Param                      | Default   | Meaning                       |
| -------------------------- | --------- | ----------------------------- |
| `visitors`                 | `5000000` | Unique waiting-room visitors  |
| `averageWaitSeconds`       | `900`     | Typical wait before admission |
| `pollIntervalSeconds`      | `2.5`     | Status poll interval          |
| `heartbeatIntervalSeconds` | `10`      | Heartbeat interval            |

Interactive UI: `GET /cost`.

## Admin

### `GET /admin`

First visit runs a **setup wizard** (password → queue/mode → branding with live preview). Later visits require login. Dashboard edits branding and admission mode; KV writes only on Save / Finish setup.

### Admin API

| Method | Path | Auth | Notes |
| ------ | ---- | ---- | ----- |
| `GET` | `/api/admin/bootstrap` | public | `{ setupComplete, defaultQueue }` |
| `POST` | `/api/admin/setup` | public once | Creates password hash + branding; sets session cookie |
| `POST` | `/api/admin/login` | public | Session cookie on success |
| `POST` | `/api/admin/logout` | session | Clears cookie |
| `GET` | `/api/admin/state` | session | Branding + metrics |
| `PUT` | `/api/admin/branding` | session | KV write |
| `POST` | `/api/admin/mode` | session | Queue ↔ Lottery |
| `POST` | `/api/admin/reset` | `TOKEN_SECRET` bearer only | Clears setup (emergency / tests) |

`/admit` and `/mode` accept either an admin session cookie or `TOKEN_SECRET` via Bearer / `X-TideGuard-Operator`.

Admitted visitors receive an HMAC-SHA256 token:

```text
base64url(payload).base64url(signature)
```

Claims:

| Field   | Meaning                  |
| ------- | ------------------------ |
| `sub`   | Visitor id               |
| `queue` | Queue name               |
| `iat`   | Issued-at (unix seconds) |
| `exp`   | Expiry (unix seconds)    |

Send tokens as:

- `Authorization: Bearer <token>`, or
- `?accessToken=`, or
- cookie `tg_access`

Verification uses a timing-safe signature compare. Protected pages should call `requireAdmission()` (wired in the demo milestone).
