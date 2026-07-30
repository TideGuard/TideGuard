# Admin

The admin surface lives at `/admin`. It has four jobs:

1. **First-run setup** (wizard) — claim with `TOKEN_SECRET`, verify Cloudflare, provision Turnstile, then queue + branding
2. **Sign in** — username + password + Turnstile
3. **Control room** — branding, traffic, origin, Cloudflare zone controls, team, activity
4. **Accept invite** — `/admin?invite=…` for additional admins (Turnstile required)

Visitor pages never write KV. Admin does, and only on explicit Save / Finish setup / invite actions.

## Setup wizard

Shown when `admin:config` is missing from KV. Until then, `GET /` redirects to `/admin`.

| Step          | You set                                                                               | Stored when                                     |
| ------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1. Account    | `TOKEN_SECRET` + username + password (8+, uppercase, digit or symbol; live checklist) | Finish setup                                    |
| 2. Cloudflare | **2a** verify API token → **2b** zone/hostname verify (+ Fix) → **2c** SSL Set/Skip → **2d** domain Attach/Skip | Finish setup (credentials sealed in KV)         |
| 3. Turnstile  | Create widget → complete challenge → **Click to verify**                              | Finish setup (sitekey + sealed secret in KV)    |
| 4. Queue      | Queue name, mode, depth, redirect path, click-to-enter / hold                         | Finish setup                                    |
| 5. Branding   | Title, message, colors                                                                | Finish setup (live preview is client-side only) |

Cloudflare step 2 is progressive: the API token must verify before zone fields; proxied DNS verify is required; SSL Full (strict) and custom domain are optional (Skip for now). After finish, browser Back returns to login/dashboard — not the claim wizard.

On finish, TideGuard:

- Requires `Authorization: Bearer <TOKEN_SECRET>` so a stranger cannot claim a public Worker
- Requires completed Cloudflare verify + Turnstile verify (pending KV promoted on finish)
- Writes a PBKDF2 password hash + salt for the first user in KV (`admin:config` → `users[]`)
- Writes branding to KV (`branding:<queue>`)
- Seals Cloudflare API token + account/zone metadata; stores Turnstile sitekey + sealed secret
- Sets admission mode on the queue Durable Object
- Issues an admin session cookie (`tg_admin`) with `sub` + `username`

`TOKEN_SECRET` remains a Wrangler secret. It signs visitor tickets, admission tokens, and admin session cookies. Daily login uses username + password **plus Turnstile**.

Legacy installs with a single top-level password hash migrate to `users[{ username: "admin", … }]` on first read.

## Login

After setup, `/admin` asks for **username**, password, and a **Turnstile** challenge. Success sets `tg_admin` (HttpOnly, `SameSite=Lax`, 12h TTL). Rate limits still apply; Turnstile is the primary brute-force control.

## Team invites

Admins can create invite links from the **Team** panel:

1. **Create invite** → one-time URL (`/admin?invite=<id>.<token>`) shown once
2. Share the link however you like (chat, password manager, etc.) — TideGuard does not send email
3. Invitee sets their own username + password (same strength rules as first admin) within **72 hours**
4. Unused or revoked invites expire; create a new one if needed

Raw invite tokens are never stored — only a SHA-256 hash in KV with `expirationTtl`. There is no password-reset flow; emergency wipe is still `POST /api/admin/reset` with Bearer `TOKEN_SECRET`.

## Activity audit log

Consequential control-room actions append to a KV ring (`admin:audit`, ~200 events): who, what, when. The **Activity** panel lists them. Secrets are never logged.

## Confirmations

Toggles that change visitor-visible or security-sensitive behavior (pause, mode, origin proxy, geo block, Pass queue, Cloudflare Fix, invite revoke, open-now) ask **Are you sure?** in the UI before calling the API.

## Control room

React SPA (Mantine + Chart.js) served from Workers Static Assets under `/admin/`. Dark teal theme (Source Sans). Includes live queue, **adaptive traffic** (inflow vs max outflow chart + live rate control), branding, schedule/pause/health, origin proxy, allowlist, geo block, Cloudflare controls, team, activity, and updates.

Build with `npm run build:admin` (also runs before `npm run dev` / `npm run deploy`).

### Adaptive max outflow

Operators can change admit rate without redeploying:

1. Set the value in the traffic panel and click **Update** (`PUT /api/admin/rate`)
2. Pause / resume with the play-pause control (`POST /api/admin/pause`)
3. Clear the override with `DELETE /api/admin/rate` to fall back to `ADMIT_PER_SECOND`

The chart shows joins per interval (inflow) vs the setpoint (max outflow). Series come from the Durable Object (`GET /api/admin/traffic`, ~15s buckets, ~2h retention).

Office / staff bypass: [IP allowlist](ip-allowlist.md). Temporary country blocks: [Country block](geo-block.md). Traffic charts: [analytics.md](analytics.md). Origin lock-down including Authenticated Origin Pulls: [protecting-origin.md](protecting-origin.md).

## API (admin)

| Method               | Path                                        | Auth                                                      |
| -------------------- | ------------------------------------------- | --------------------------------------------------------- |
| `GET`                | `/api/admin/bootstrap`                      | Public (`setupComplete`, `turnstileSitekey`, `version`)   |
| `POST`               | `/api/admin/setup/cloudflare/token-verify`  | Bearer `TOKEN_SECRET` (wizard)                            |
| `POST`               | `/api/admin/setup/cloudflare/verify`        | Bearer `TOKEN_SECRET` (wizard)                            |
| `POST`               | `/api/admin/setup/cloudflare/fix`           | Bearer `TOKEN_SECRET` (wizard)                            |
| `POST`               | `/api/admin/setup/cloudflare/attach-domain` | Bearer `TOKEN_SECRET` (wizard)                            |
| `POST`               | `/api/admin/setup/cloudflare/ssl`           | Bearer `TOKEN_SECRET` (wizard)                            |
| `POST`               | `/api/admin/setup/turnstile/provision`      | Bearer `TOKEN_SECRET` (wizard)                            |
| `POST`               | `/api/admin/setup/turnstile/verify`         | Bearer `TOKEN_SECRET` (wizard)                            |
| `POST`               | `/api/admin/setup`                          | Bearer `TOKEN_SECRET` once; requires pending CF+Turnstile |
| `POST`               | `/api/admin/login`                          | Public (rate-limited); username + password + Turnstile    |
| `POST`               | `/api/admin/logout`                         | Session                                                   |
| `GET`                | `/api/admin/state`                          | Session (includes `me`, `team`, `turnstile`, traffic)     |
| `GET`                | `/api/admin/metrics`                        | Session                                                   |
| `GET`                | `/api/admin/traffic`                        | Session (inflow/outflow time series)                      |
| `PUT`                | `/api/admin/rate`                           | Session (set max outflow override)                        |
| `DELETE`             | `/api/admin/rate`                           | Session (clear override → env default)                    |
| `PUT`                | `/api/admin/cloudflare/ip-geolocation`      | Session                                                   |
| `PUT`                | `/api/admin/cloudflare/ssl`                 | Session (set Full strict)                                 |
| `GET`/`PUT`/`DELETE` | `/api/admin/cloudflare/domains`             | Session (list / attach / detach)                          |
| `GET`                | `/api/admin/updates`                        | Session (optional `?refresh=1`)                           |
| `GET`                | `/api/admin/audit`                          | Session                                                   |
| `GET`                | `/api/admin/invites`                        | Session                                                   |
| `POST`               | `/api/admin/invites`                        | Session (returns accept URL once)                         |
| `DELETE`             | `/api/admin/invites/:id`                    | Session                                                   |
| `POST`               | `/api/admin/invites/accept`                 | Public (rate-limited); invite + Turnstile                 |
| `PUT`                | `/api/admin/branding`                       | Session                                                   |
| `PUT`                | `/api/admin/origin`                         | Session                                                   |
| `POST`               | `/api/admin/mode`                           | Session                                                   |
| `PUT`                | `/api/admin/schedule`                       | Session                                                   |
| `POST`               | `/api/admin/pause`                          | Session                                                   |
| `PUT`                | `/api/admin/health`                         | Session                                                   |
| `POST`               | `/api/admin/reset`                          | Bearer `TOKEN_SECRET` only                                |

Operator routes `/admit`, `/mode`, `/pause`, and `/metrics` accept either the admin session cookie or `TOKEN_SECRET` via Bearer / `X-TideGuard-Operator`.

## Emergency reset

If you lose all admin passwords (local or staging):

```bash
curl -X POST https://<host>/api/admin/reset \
  -H "Authorization: Bearer $TOKEN_SECRET"
```

Then reopen `/admin` and run the wizard again. This clears admin users, invites, audit log, origin override, bypass, geo, Turnstile, and setup-pending; branding keys are left as-is unless you overwrite them in the next setup.
