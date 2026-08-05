# API

HTTP contracts for TideGuard. Base URL is your Worker hostname (local: `http://localhost:8787`).

For first deploy and `/admin` setup, see [getting-started.md](getting-started.md). For the wizard and branding control room, see [admin.md](admin.md).

Machine-readable contract: [openapi.yaml](../openapi.yaml) (OpenAPI 3.1).

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

Waiting responses include `admissionMode` (`queue` | `lottery`), while waiting `nextCheckAt` (absolute unix ms, second-aligned timeslot) and `nextPollAfterMs` (compat delay hint). Depth fields (`waiting`, `ahead`, `behind`, `lotteryOdds`) are included **only** when branding `showWaitingCount` (“Show place in line”) is enabled. Public join/status never expose pause, health, `opensAt`, or capacity.

- **Queue Mode** — `position` (1-based FIFO), optional `ahead` / `behind` / `#X of Y`, `estimatedWaitSeconds`, `nextCheckAt`
- **Lottery Mode** — `position` omitted, `estimatedWaitSeconds`, optional `lotteryOdds` / `waiting`, plus `nextCheckAt`

Check-in timeslots keep Durable Object status load near a fixed **750 RPS** budget (`periodSec = max(5, ceil(waiting/750))`). Front-of-line waiters stay on a 5s period. Early `/status` before `nextCheckAt` is **read-only** (does not renew liveness). The built-in waiting room (full page and `?embed=1`) schedules on `nextCheckAt`. Fixed intervals via `WAITING_ROOM_POLL_INTERVAL_MS` / `WAITING_ROOM_HEARTBEAT_INTERVAL_MS` are advanced and not recommended.

If a valid `tg_ticket` cookie is already present for the queue, join **resumes that visitor** and ignores a conflicting body `visitorId` (same-browser multi-tab). When the waiting-row cap is reached, `/join` returns `503 queue_full`.

### `GET /status?queue=…&id=…`

Current visitor status. Requires cookie `tg_ticket` for that visitor/queue.
When `status` is `admitted` and click-to-enter is satisfied, response includes `accessToken` and sets HttpOnly `tg_access`.
Same field rules as `/join` (no ops fields; depth only if `showWaitingCount`). Waiting `/status` renews liveness **only when the timeslot is due**.

### `POST /leave`

Requires `tg_ticket`.

```json
{ "queue": "product-launch", "visitorId": "…" }
```

### `POST /heartbeat`

Keep a waiting visitor alive. Requires `tg_ticket`. Usually unnecessary for the built-in waiting room (status renews liveness); kept for custom clients and fixed-interval overrides.

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

Admin UI also polls `GET /api/admin/metrics` every 5s (admin session) for the live metric strip and geo-block hit stats. The **traffic chart** uses `GET /api/admin/traffic` (server-backed ~15s buckets, ~24h retention; `format=csv` for export) — see [analytics.md](analytics.md).

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

| Param                      | Default        | Meaning                                                         |
| -------------------------- | -------------- | --------------------------------------------------------------- |
| `visitors`                 | `5000000`      | Unique waiting-room visitors                                    |
| `averageWaitSeconds`       | `900`          | Typical wait before admission                                   |
| `pollingMode`              | `adaptive`     | `adaptive` (default) or `fixed` (advanced, not recommended)     |
| `pollIntervalSeconds`      | ~`41.7` / `15` | Adaptive average, or fixed status poll when `pollingMode=fixed` |
| `heartbeatIntervalSeconds` | `0` / `30`     | Unused in adaptive; fixed heartbeat when `pollingMode=fixed`    |

Interactive UI: `GET /cost` (adaptive by default; fixed intervals under advanced).

## Admin

### `GET /admin`

React admin SPA (Mantine + Chart.js) from Workers Static Assets. First visit runs a **setup wizard** (claim with `TOKEN_SECRET` + username/password locks the account, then Cloudflare → Turnstile → queue/mode → branding). Later visits require username + password + Turnstile. Invite links use `/admin?invite=…`. The control room has a sticky event toolbar (rate, pause, force-admit, Pass queue), section tabs (Live, Admission, Branding, Access, Cloudflare, Team, System), branding preview, and Cloudflare zone controls.

Build assets with `npm run build:admin` before `wrangler deploy`.

### Admin API

| Method | Path                                       | Auth                         | Notes                                                                      |
| ------ | ------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------- |
| `GET`  | `/api/admin/bootstrap`                     | public                       | Setup flags, version, `tosVersion` / `tosSummary` / `acceptedTosVersion`   |
| `POST` | `/api/admin/claim`                         | `TOKEN_SECRET` bearer (once) | Requires `acceptedTosVersion` (= current); locks first admin + session     |
| `POST` | `/api/admin/tos/accept`                    | session (stale ToS OK)       | Requires `acceptedTosVersion` (= current); stamps that version on the user |
| `POST` | `/api/admin/setup/cloudflare/token-verify` | admin session                | Validates API token and seals it in setup-pending (no zone write)          |

| `POST` | `/api/admin/setup/cloudflare/verify` | admin session | Token + zone verify; stores setup pending |
| `POST` | `/api/admin/setup/cloudflare/fix` | admin session | Orange-cloud DNS + IP Geolocation |
| `PUT` | `/api/admin/setup/cloudflare/ssl` | admin session | Set Full (strict) during wizard (or skip) |
| `POST` | `/api/admin/setup/cloudflare/attach-domain` | admin session | Attach Workers custom domain during wizard |
| `POST` | `/api/admin/setup/turnstile/provision` | admin session | Creates Turnstile widget; seals secret pending |
| `POST` | `/api/admin/setup/turnstile/verify` | admin session | Siteverify challenge during wizard |
| `POST` | `/api/admin/setup` | admin session | Requires pending CF+Turnstile; finishes setup |
| `POST` | `/api/admin/login` | public (rate-limited) | Username + password + Turnstile → session cookie |
| `POST` | `/api/admin/logout` | session | Clears cookie |
| `GET` | `/api/admin/state` | session | Branding + metrics + `me` + `team` + `turnstile` |
| `GET` | `/api/admin/metrics` | session | Live queue metrics + geo-block stats |
| `PUT` | `/api/admin/cloudflare` | session | Save zone / hostname / API token |
| `POST` | `/api/admin/cloudflare/check` | session | Verify proxied DNS / setup summary |
| `POST` | `/api/admin/cloudflare/fix-proxy` | session | Enable orange-cloud + IP Geolocation |
| `PUT` | `/api/admin/cloudflare/ip-geolocation` | session | Toggle IP Geolocation; off clears country block |
| `PUT` | `/api/admin/cloudflare/ssl` | session | Set encryption mode to Full (strict) |
| `GET`/`PUT`/`DELETE` | `/api/admin/cloudflare/domains` | session | List / attach / detach Workers custom domains |
| `PUT` | `/api/admin/bypass` | session | IP allowlist text |
| `PUT` | `/api/admin/geo-block` | session | Country block enable / list / TTL |
| `POST` | `/api/admin/pass` | session | Mint admission cookie for this browser |
| `GET` | `/api/admin/updates` | session | GitHub latest release vs running `VERSION` (KV cache) |
| `GET` | `/api/admin/audit` | session | Recent admin activity events |
| `GET` | `/api/admin/invites` | session | Pending invites (no raw tokens) |
| `POST` | `/api/admin/invites` | session | Create 72h invite; returns accept URL once |
| `DELETE` | `/api/admin/invites/:id` | session | Revoke invite |
| `POST` | `/api/admin/invites/accept` | public (rate-limited) | Token + username + password + Turnstile + `acceptedTosVersion` → session |
| `PUT` | `/api/admin/password` | session | Change own password (current + new + confirm) |
| `POST` | `/api/admin/password/recover` | public (rate-limited) | Recovery phrase + Turnstile → new password + session |
| `POST` | `/api/admin/recovery/regenerate` | session | Regenerate recovery phrase (current password); returns phrase once |
| `DELETE` | `/api/admin/users/:id` | session | Remove another admin (not self / not last) |
| `PUT` | `/api/admin/branding` | session | KV write |
| `PUT` | `/api/admin/origin` | session | Origin proxy override in KV |
| `POST` | `/api/admin/mode` | session | Queue ↔ Lottery |
| `PUT` | `/api/admin/schedule` | session | Opening time (`opensAt` ms UTC, or `null` = open now) |
| `POST` | `/api/admin/pause` | session | Silent pause / resume |
| `PUT` | `/api/admin/rate` | session | Set max outflow (`admitPerSecond` override) |
| `DELETE` | `/api/admin/rate` | session | Clear rate override (env `ADMIT_PER_SECOND`) |
| `GET` | `/api/admin/traffic` | session | Inflow/outflow (~15s buckets, ~24h; `format=csv`) |
| `PUT` | `/api/admin/webhooks` | session | Operator outbound webhooks |
| `PUT` | `/api/admin/health` | session | Origin health config / override / clear override |
| `POST` | `/api/admin/reset` | `TOKEN_SECRET` bearer only | Clears admin, CF link, Turnstile, pending, origin |

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
