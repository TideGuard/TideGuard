# Admin

The admin surface lives at `/admin`. It has four jobs:

1. **First-run setup** (wizard) — claim with `TOKEN_SECRET`, verify Cloudflare, provision Turnstile, then queue + branding
2. **Sign in** — username + password + Turnstile
3. **Control room** — branding, traffic, origin, Cloudflare zone controls, team, activity
4. **Accept invite** — `/admin?invite=…` for additional admins (Turnstile required)

Visitor pages never write KV. Admin does, and only on explicit Save / Finish setup / invite actions.

## Setup wizard

Shown when `admin:config` is missing from KV. Until then, `GET /` redirects to `/admin`.

| Step          | You set                                                                                           | Stored when                                     |
| ------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1. Account    | `TOKEN_SECRET` + username + admin password (8–128 chars)                                          | Finish setup                                    |
| 2. Cloudflare | API token + Zone ID + hostname → **Click to verify**; Fix proxy/geo; optional SSL / domain attach | Finish setup (credentials sealed in KV)         |
| 3. Turnstile  | Create widget → complete challenge → **Click to verify**                                          | Finish setup (sitekey + sealed secret in KV)    |
| 4. Queue      | Queue name, mode, depth, redirect path, click-to-enter / hold                                     | Finish setup                                    |
| 5. Branding   | Title, message, colors                                                                            | Finish setup (live preview is client-side only) |

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
3. Invitee sets their own username + password within **72 hours**
4. Unused or revoked invites expire; create a new one if needed

Raw invite tokens are never stored — only a SHA-256 hash in KV with `expirationTtl`. There is no password-reset flow; emergency wipe is still `POST /api/admin/reset` with Bearer `TOKEN_SECRET`.

## Activity audit log

Consequential control-room actions append to a KV ring (`admin:audit`, ~200 events): who, what, when. The **Activity** panel lists them. Secrets are never logged.

## Confirmations

Toggles that change visitor-visible or security-sensitive behavior (pause, mode, origin proxy, geo block, Pass queue, Cloudflare Fix, invite revoke, open-now) ask **Are you sure?** in the UI before calling the API.

## Control room

Dark teal single-page UI (Source Sans). Includes live queue, analytics, traffic, origin proxy, allowlist, geo block, **Cloudflare control plane** (IP Geolocation switch, SSL Full strict, custom domains), team, activity, and updates.

Office / staff bypass: [IP allowlist](ip-allowlist.md). Temporary country blocks: [Country block](geo-block.md). Charts: [analytics.md](analytics.md). Origin lock-down including Authenticated Origin Pulls: [protecting-origin.md](protecting-origin.md).

## API (admin)

| Method               | Path                                        | Auth                                                      |
| -------------------- | ------------------------------------------- | --------------------------------------------------------- |
| `GET`                | `/api/admin/bootstrap`                      | Public (`setupComplete`, `turnstileSitekey`, `version`)   |
| `POST`               | `/api/admin/setup/cloudflare/verify`        | Bearer `TOKEN_SECRET` (wizard)                            |
| `POST`               | `/api/admin/setup/cloudflare/fix`           | Bearer `TOKEN_SECRET` (wizard)                            |
| `POST`               | `/api/admin/setup/cloudflare/attach-domain` | Bearer `TOKEN_SECRET` (wizard)                            |
| `POST`               | `/api/admin/setup/cloudflare/ssl`           | Bearer `TOKEN_SECRET` (wizard)                            |
| `POST`               | `/api/admin/setup/turnstile/provision`      | Bearer `TOKEN_SECRET` (wizard)                            |
| `POST`               | `/api/admin/setup/turnstile/verify`         | Bearer `TOKEN_SECRET` (wizard)                            |
| `POST`               | `/api/admin/setup`                          | Bearer `TOKEN_SECRET` once; requires pending CF+Turnstile |
| `POST`               | `/api/admin/login`                          | Public (rate-limited); username + password + Turnstile    |
| `POST`               | `/api/admin/logout`                         | Session                                                   |
| `GET`                | `/api/admin/state`                          | Session (includes `me`, `team`, `turnstile`)              |
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
