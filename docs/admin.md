# Admin

The admin surface lives at `/admin`. It has three jobs, in order:

1. **First-run setup** (wizard)
2. **Sign in**
3. **Control room** (branding, mode, metrics)

Visitor pages never write KV. Admin does, and only on explicit Save / Finish setup.

## Setup wizard

Shown when `admin:config` is missing from KV.

| Step        | You set                                                       | Stored when                                     |
| ----------- | ------------------------------------------------------------- | ----------------------------------------------- |
| 1. Password | `TOKEN_SECRET` + admin password (8–128 chars)                 | Finish setup                                    |
| 2. Queue    | Queue name, mode, depth, redirect path, click-to-enter / hold | Finish setup                                    |
| 3. Branding | Title, message, colors                                        | Finish setup (live preview is client-side only) |

On finish, TideGuard:

- Requires `Authorization: Bearer <TOKEN_SECRET>` so a stranger cannot claim a public Worker
- Writes a PBKDF2 password hash + salt to KV (`admin:config`)
- Writes branding to KV (`branding:<queue>`)
- Sets admission mode on the queue Durable Object
- Issues an admin session cookie (`tg_admin`)

`TOKEN_SECRET` remains a Wrangler secret. It signs visitor tickets, admission tokens, and admin session cookies. The wizard does **not** replace it — it only proves you know the secret.

## Login

After setup, `/admin` asks for the password. Success sets `tg_admin` (HttpOnly, `SameSite=Lax`, 12h TTL).

## Control room

Dark teal single-page UI (Source Sans). Two columns on desktop:

| Left                                          | Right                               |
| --------------------------------------------- | ----------------------------------- |
| Metrics: waiting, admitted, capacity, mode    | Live waiting-room preview           |
| Queue name, Queue / Lottery toggle            | Updates as you edit colors and copy |
| “Show depth” checkbox                         |                                     |
| Title, message, color pickers                 |                                     |
| **Traffic controls** (opening, pause, health) |                                     |
| **Save branding** / **Apply mode**            |                                     |

| Control                | Effect                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| Live preview           | Updates as you edit; no KV write                                                               |
| Save branding          | One KV put for `branding:<queue>` (+ syncs click-to-enter hold + `showWaitingCount` to the DO) |
| Apply mode             | `queue` or `lottery` on the Durable Object                                                     |
| Load queue / default   | Switch named queues; remembered list + optional default                                        |
| Capacity / admit rate  | Live DO overrides (no redeploy)                                                                |
| Force-admit            | Admit up to N waiters into open slots now                                                      |
| Change password        | Requires current password; refreshes session cookie                                            |
| Show depth             | Persisted with branding as `showWaitingCount` (no `?showWaiting=` override on `/wait`)         |
| Default redirect path  | Same-origin path after admission (`redirectUrl`); overridable by `?return=`                    |
| Require click to enter | Continue button instead of auto-redirect; token issued on `POST /enter`                        |
| Admit hold (seconds)   | Time to click before the admitted spot is released (15–900)                                    |
| Metrics                | Waiting / admitted / capacity / rate / mode — auto-refresh every 5s                            |

### Traffic controls

First-class panel on the dashboard:

| Control       | Visitors see                       | Operators do                                 |
| ------------- | ---------------------------------- | -------------------------------------------- |
| Opening time  | Countdown on `/wait` HTML only     | Set datetime (UTC) or clear = open now       |
| Silent pause  | Normal waiting UI; admissions stop | Toggle pause — visitors are **not** told     |
| Origin health | Silent rate cut → auto-pause       | URL, latency/status thresholds, override 15m |

```text
canAdmit = !manualPause && !autoPause && now >= opensAt
admitRate = baseAdmitPerSecond × healthMultiplier
```

**Multi-tab:** one browser profile = one seat via `tg_ticket`. Extra devices can still take extra seats — TideGuard paces capacity; it is not a bot/identity system. Mitigations: lower capacity, Lottery Mode, Cloudflare Bot Fight/WAF, or require login before `/wait`.

Waiting-room depth UI (only when Show depth is on):

- **Lottery:** In pool
- **Queue:** Ahead and Behind

How origins verify admission and how redirects work: [verifying-admission.md](verifying-admission.md).

### Origin proxy

The control room includes an **Origin proxy** panel:

| Field         | Meaning                                 |
| ------------- | --------------------------------------- |
| Enable        | Gate + proxy non-TideGuard paths        |
| Origin URL    | Upstream `https://…`                    |
| Protect all   | Every non-reserved path needs admission |
| Path prefixes | Used when protect-all is off            |

Saved via `PUT /api/admin/origin` to KV. Full guide: [protecting-origin.md](protecting-origin.md).

## API (admin)

| Method | Path                       | Auth                                        |
| ------ | -------------------------- | ------------------------------------------- |
| `GET`  | `/api/admin/bootstrap`     | Public (`setupComplete`)                    |
| `POST` | `/api/admin/setup`         | `Authorization: Bearer <TOKEN_SECRET>` once |
| `POST` | `/api/admin/login`         | Public (rate-limited)                       |
| `POST` | `/api/admin/logout`        | Session                                     |
| `GET`  | `/api/admin/state`         | Session                                     |
| `PUT`  | `/api/admin/branding`      | Session                                     |
| `PUT`  | `/api/admin/origin`        | Session (origin proxy settings)             |
| `POST` | `/api/admin/mode`          | Session                                     |
| `PUT`  | `/api/admin/schedule`      | Session (opening time)                      |
| `POST` | `/api/admin/pause`         | Session (silent pause)                      |
| `PUT`  | `/api/admin/capacity`      | Session (live capacity / admit rate)        |
| `POST` | `/api/admin/admit`         | Session (force-admit)                       |
| `POST` | `/api/admin/password`      | Session (change password)                   |
| `PUT`  | `/api/admin/default-queue` | Session                                     |
| `PUT`  | `/api/admin/health`        | Session (origin health / override)          |
| `POST` | `/api/admin/reset`         | `Authorization: Bearer <TOKEN_SECRET>` only |

Operator routes `/admit`, `/mode`, `/pause`, and `/metrics` accept either the admin session cookie or `TOKEN_SECRET` via Bearer / `X-TideGuard-Operator`.

## Change password

While signed in, use **Change password** on `/admin` (`POST /api/admin/password`) with the current password plus a new one. This keeps setup intact and refreshes the session cookie.

## Emergency reset

If you lose the admin password (local or staging):

```bash
curl -X POST https://<host>/api/admin/reset \
  -H "Authorization: Bearer $TOKEN_SECRET"
```

Then reopen `/admin` and run the wizard again. This clears `admin:config` and `admin:origin`; branding keys are left as-is unless you overwrite them in the next setup.
