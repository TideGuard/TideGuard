# API

HTTP contracts for TideGuard. Base URL is your Worker hostname (local: `http://localhost:8787`).

For first deploy and `/admin` setup, see [getting-started.md](getting-started.md). For the wizard and branding control room, see [admin.md](admin.md).

## Errors

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

- `200` — admitted immediately (includes `accessToken`; sets HttpOnly `tg_access` + `tg_ticket`)
- `202` — waiting (sets HttpOnly `tg_ticket` only)

Every successful join sets cookie `tg_ticket` (visitor ownership proof). `/status`, `/leave`, and `/heartbeat` require that cookie to match the visitor id and queue.

Waiting responses include `admissionMode` (`queue` | `lottery`). Depth fields (`waiting`, `ahead`, `behind`, `lotteryOdds`) are included **only** when branding `showWaitingCount` is enabled for that queue (synced to the DO on branding save). Public join/status never expose pause, health, `opensAt`, or capacity.

- **Queue Mode** — `position` (1-based FIFO), optional `ahead` / `behind`, `estimatedWaitSeconds`
- **Lottery Mode** — `position` omitted, optional `lotteryOdds` (`1 / waitingCount`) and `waiting`

If a valid `tg_ticket` cookie is already present for the queue, join **resumes that visitor** and ignores a conflicting body `visitorId` (same-browser multi-tab).

### `GET /status?queue=…&id=…`

Current visitor status. Requires cookie `tg_ticket` for that visitor/queue.
When `status` is `admitted` and click-to-enter is satisfied, response includes `accessToken` and sets HttpOnly `tg_access`.
Same field rules as `/join` (no ops fields; depth only if `showWaitingCount`).

### `POST /leave`

Requires `tg_ticket`.

```json
{ "queue": "product-launch", "visitorId": "…" }
```

### `POST /heartbeat`

Keep a waiting visitor alive. Requires `tg_ticket`.

```json
{ "queue": "product-launch", "visitorId": "…" }
```

### `POST /enter`

Confirm entry after admission when **click-to-enter** is enabled. Requires `tg_ticket`.

```json
{ "queue": "product-launch", "visitorId": "…" }
```

- Marks the visitor as entered
- Returns `accessToken` and sets HttpOnly `tg_access`
- `409` if the visitor is not admitted yet
- Unconfirmed admits expire after branding `admitHoldSeconds` (server-side)

When click-to-enter is off, join/status issue the access token as soon as status is `admitted` (`entered: true`).

### Redirect after admission

Waiting room destination order:

1. `?return=` on `/wait` (same-origin relative path)
2. Branding `redirectUrl` from `/admin`
3. `/` if origin proxy is on, else `/demo`

See [verifying-admission.md](verifying-admission.md).

### `POST /admit`

Operator-only: admit up to `count` waiters into open slots, ignoring the rate budget but still respecting capacity, opening time, manual pause, and health auto-pause. Selection follows the room’s admission mode (FIFO in Queue Mode, random in Lottery Mode).

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

### `POST /pause`

Operator-only: silent pause / resume. Visitors are not told; admissions stop while paused.

```json
{ "queue": "product-launch", "paused": true }
```

### `GET /metrics?queue=…`

Operator-only (same auth as `/admit`). Queue depth, capacity, ETA, pause state, opening time, effective admit rate, health snapshot, `admissionMode`, plus ops fields: `entered`, `holding`, `openSlots`, `averageWaitSeconds`, `oldestWaitSeconds`. Computed in the Durable Object (no KV write).

Admin UI also polls `GET /api/admin/metrics` every 5s (admin session). Response includes live metrics and geo-block hit stats. Charts are built client-side from those polls (see [analytics.md](analytics.md)).

### `POST /api/admin/pass`

Admin session only. Mints an admission cookie for **this browser** and returns `{ redirectTo }` so operators can open the protected app without joining the queue. Does not consume a concurrent slot.

### `PUT /api/admin/geo-block`

Admin session only. Temporary country block list (`CF-IPCountry`) with required TTL when enabling.

```json
{ "enabled": true, "countriesText": "CN\\nRU", "ttlHours": 24 }
```

### Cost estimate

`GET /api/cost-estimate`

Query params:

| Param                      | Default   | Meaning                       |
| -------------------------- | --------- | ----------------------------- |
| `visitors`                 | `5000000` | Unique waiting-room visitors  |
| `averageWaitSeconds`       | `900`     | Typical wait before admission |
| `pollIntervalSeconds`      | `15`      | Status poll interval          |
| `heartbeatIntervalSeconds` | `30`      | Heartbeat interval            |

Interactive UI: `GET /cost`.

## Admin

### `GET /admin`

First visit runs a **setup wizard** (`TOKEN_SECRET` → password → queue/mode → branding with live preview). Later visits require login. Dashboard edits branding, admission mode, and origin proxy; KV writes only on Save / Finish setup.

### Admin API

| Method | Path                   | Auth                         | Notes                                                 |
| ------ | ---------------------- | ---------------------------- | ----------------------------------------------------- |
| `GET`  | `/api/admin/bootstrap` | public                       | `{ setupComplete, defaultQueue }`                     |
| `POST` | `/api/admin/setup`     | `TOKEN_SECRET` bearer (once) | Creates password hash + branding; sets session cookie |
| `POST` | `/api/admin/login`     | public (rate-limited)        | Session cookie on success                             |
| `POST` | `/api/admin/logout`    | session                      | Clears cookie                                         |
| `GET`  | `/api/admin/state`     | session                      | Branding + metrics + origin                           |
| `PUT`  | `/api/admin/branding`  | session                      | KV write                                              |
| `PUT`  | `/api/admin/origin`    | session                      | Origin proxy override in KV                           |
| `POST` | `/api/admin/mode`      | session                      | Queue ↔ Lottery                                       |
| `PUT`  | `/api/admin/schedule`  | session                      | Opening time (`opensAt` ms UTC, or `null` = open now) |
| `POST` | `/api/admin/pause`     | session                      | Silent pause / resume                                 |
| `PUT`  | `/api/admin/health`    | session                      | Origin health config / override / clear override      |
| `POST` | `/api/admin/reset`     | `TOKEN_SECRET` bearer only   | Clears admin setup + origin override                  |

`/admit`, `/mode`, `/pause`, and `/metrics` accept either an admin session cookie or `TOKEN_SECRET` via Bearer / `X-TideGuard-Operator`.

Admitted visitors receive an HMAC-SHA256 token (also set as HttpOnly cookie `tg_access`):

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
