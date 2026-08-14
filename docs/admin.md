# Admin

The admin surface lives at `/admin`. It has four jobs:

1. **First-run setup** (wizard) — claim with `TOKEN_SECRET`, verify Cloudflare, provision Turnstile, then queue + branding
2. **Sign in** — username + password + Turnstile
3. **Control room** — branding, traffic, origin, Cloudflare zone controls, team, activity
4. **Accept invite** — `/admin?invite=…` for additional admins (Turnstile required)

Visitor pages never write KV. Admin does, and only on explicit Save / Finish setup / invite actions.

## Setup wizard

Shown until first-time setup is finished (`setupComplete`). Until then, `GET /` redirects to `/admin`.

| Step          | You set                                                                                                         | Stored when                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1. Account    | `TOKEN_SECRET` + username + password + **Terms of Service** ack                                                 | **Immediately on Claim** — locks account + issues `tg_admin` session |
| 2. Cloudflare | **2a** verify API token → **2b** zone/hostname verify (+ Fix) → **2c** SSL Set/Skip → **2d** domain Attach/Skip | Pending KV; promoted on Finish                                       |
| 3. Turnstile  | Create widget → complete challenge → **Click to verify**                                                        | Pending KV; promoted on Finish                                       |
| 4. Queue      | Queue name, mode, depth, redirect path, click-to-enter / hold                                                   | Finish setup                                                         |
| 5. Branding   | Title, message, colors                                                                                          | Finish setup (live preview is client-side only)                      |

Cloudflare step 2 is progressive: the API token must verify before zone fields; proxied DNS verify is required; SSL Full (strict) and custom domain are optional (Skip for now). If the session expires mid-wizard, **Sign in** resumes setup.

On **claim**, TideGuard:

- Requires Bearer `TOKEN_SECRET` so a stranger cannot claim a public Worker
- Requires `acceptedTosVersion` equal to the current operator [Terms of Service](../TERMS.md) version (stamped on the user)
- Locks in the first admin account and shows a 12-word recovery phrase once
- Issues an admin session (`tg_admin`)

Invite accept uses the **same** Terms acknowledgment. After an upgrade that bumps `TOS_VERSION` in code, each admin must re-accept on next login before other control-room APIs work (`403 tos_required` until `POST /api/admin/tos/accept`).

On **finish**, TideGuard:

- Requires that admin session (not TOKEN_SECRET / password again)
- Requires completed Cloudflare verify + Turnstile verify
- Marks setup complete, writes branding, seals Cloudflare + Turnstile secrets, and sets admission mode on the queue

`TOKEN_SECRET` remains a Wrangler secret. It signs visitor tickets, admission tokens, and admin session cookies. Daily login (after finish) uses username + password **plus Turnstile**.

## Login

After the Worker is claimed, `/admin` shows **Sign in** when there is no session. Until setup is finished, Turnstile may be skipped (widget not saved yet). After finish, login requires **username**, password, and **Turnstile**.

## Team invites

Admins can create invite links from the **Team** panel:

1. **Create invite** → one-time URL (`/admin?invite=<id>.<token>`) shown once
2. Share the link however you like (chat, password manager, etc.) — TideGuard does not send email
3. Invitee sets their own username + password within **72 hours** and saves the recovery phrase shown once
4. Unused or revoked invites expire; create a new one if needed

Raw invite tokens are hashed in KV (not stored in clear). Forgot password uses the recovery phrase plus Turnstile. Emergency wipe: `POST /api/admin/reset` with Bearer `TOKEN_SECRET`.

## Activity audit log

Consequential control-room actions append to a KV ring (`admin:audit`, ~200 events): who, what, when. The **Activity** panel lists them. Secrets are never logged.

## Confirmations

Toggles that change visitor-visible or security-sensitive behavior (pause, mode, origin proxy, geo block, Pass queue, Cloudflare Fix, invite revoke, open-now) ask **Are you sure?** in the UI before calling the API.

## Control room

React SPA (Mantine + Chart.js) served from Workers Static Assets under `/admin/`. Dark teal theme (Source Sans). Layout:

- **Sticky event toolbar** — waiting/admitted chips, pause, admit rate (+ clear override), force-admit, Pass queue
- **Queue selector** — switch remembered named queues, or create one by cloning the current queue's branding
- **Tabs** — Live (metrics + 24h traffic chart / CSV), Admission (schedule + health), Branding (preview + embed snippet), Access (origin + Cloudflare Access guidance), Cloudflare (+ Turnstile), Team, System (activity, updates, webhooks, TOKEN_SECRET rotation, max waiting / missed-slot grace / Danger zone, factory reset)

Build with `npm run build:admin` (also runs before `npm run dev` / `npm run deploy`).

### Branding

Colors, copy, admit UX, and optional **Google Analytics Measurement ID** (`G-…`) live under the Branding tab. Saving writes KV once; visitor join/status polls do not re-read branding.

When a Measurement ID is set, `/wait` loads [Google’s official gtag.js snippet](https://support.google.com/analytics/answer/14171598). Invalid IDs are dropped on save. TideGuard does not provide a cookie banner — consent and privacy policy remain the operator’s responsibility.

### Adaptive max outflow

Operators can change admit rate without redeploying:

1. Set the value in the event toolbar and click **Set rate** (`PUT /api/admin/rate`)
2. Pause / resume with the play-pause control (`POST /api/admin/pause`)
3. Clear the override with **Clear override** (`DELETE /api/admin/rate`) to fall back to `ADMIT_PER_SECOND`
4. Force-admit waiting visitors via **Force admit** (`POST /admit`)

The chart shows joins per interval (inflow) vs the setpoint (max outflow). Series come from the Durable Object (`GET /api/admin/traffic`, ~15s buckets, ~**24h** retention). Export with `?format=csv`. Range presets in the UI: 2h / 12h / 24h.

**Queues vs paths:** path prefixes choose which URLs require admission; they do not create separate queues. The toolbar selects remembered queue names and updates `?queue=` for state loads. **Create** validates a new queue name and copies the current queue's branding; integrations must still send that queue name to `/join` and `/status`.

Office / staff bypass: [IP allowlist](ip-allowlist.md). Temporary country blocks: [Country block](geo-block.md). Traffic charts: [analytics.md](analytics.md). Origin lock-down including Authenticated Origin Pulls: [protecting-origin.md](protecting-origin.md). Operator callbacks: [webhooks.md](webhooks.md). Secret rotation: [token-secret-rotation.md](token-secret-rotation.md). Cloudflare Access in front of `/admin`: see **Access** tab + [SECURITY.md](../SECURITY.md).

## API (admin)

| Method               | Path                                        | Auth                                                               |
| -------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| `GET`                | `/api/admin/bootstrap`                      | Public (`setupComplete`, `claimed`, `turnstileSitekey`, `version`) |
| `POST`               | `/api/admin/claim`                          | Bearer `TOKEN_SECRET` once; locks admin + session                  |
| `POST`               | `/api/admin/setup/cloudflare/token-verify`  | Session (after claim)                                              |
| `POST`               | `/api/admin/setup/cloudflare/verify`        | Session (after claim)                                              |
| `POST`               | `/api/admin/setup/cloudflare/fix`           | Session (after claim)                                              |
| `POST`               | `/api/admin/setup/cloudflare/attach-domain` | Session (after claim)                                              |
| `POST`               | `/api/admin/setup/cloudflare/ssl`           | Session (after claim)                                              |
| `POST`               | `/api/admin/setup/turnstile/provision`      | Session (after claim)                                              |
| `POST`               | `/api/admin/setup/turnstile/verify`         | Session (after claim)                                              |
| `POST`               | `/api/admin/setup`                          | Session; requires pending CF+Turnstile; finishes setup             |
| `POST`               | `/api/admin/login`                          | Public (rate-limited); username + password + Turnstile             |
| `POST`               | `/api/admin/logout`                         | Session                                                            |
| `GET`                | `/api/admin/state`                          | Session (includes `me`, `team`, `turnstile`, traffic)              |
| `GET`                | `/api/admin/metrics`                        | Session                                                            |
| `GET`                | `/api/admin/traffic`                        | Session (inflow/outflow; `format=csv` optional)                    |
| `PUT`                | `/api/admin/rate`                           | Session (set max outflow override)                                 |
| `DELETE`             | `/api/admin/rate`                           | Session (clear override → env/code default)                        |
| `PUT`                | `/api/admin/webhooks`                       | Session (operator outbound webhooks)                               |
| `PUT`                | `/api/admin/room-rules`                     | Session (crawler/cookie/header bypass and full/JSON behavior)      |
| `POST`               | `/api/admin/queues/clone-branding`          | Session (copy branding and remember destination queue)             |
| `PUT`                | `/api/admin/cloudflare/ip-geolocation`      | Session                                                            |
| `PUT`                | `/api/admin/cloudflare/ssl`                 | Session (set Full strict)                                          |
| `GET`/`PUT`/`DELETE` | `/api/admin/cloudflare/domains`             | Session (list / attach / detach)                                   |
| `GET`                | `/api/admin/updates`                        | Session (optional `?refresh=1`)                                    |
| `GET`                | `/api/admin/audit`                          | Session                                                            |
| `GET`                | `/api/admin/invites`                        | Session                                                            |
| `POST`               | `/api/admin/invites`                        | Session (returns accept URL once)                                  |
| `DELETE`             | `/api/admin/invites/:id`                    | Session                                                            |
| `POST`               | `/api/admin/invites/accept`                 | Public (rate-limited); invite + Turnstile                          |
| `PUT`                | `/api/admin/password`                       | Session (change own password)                                      |
| `POST`               | `/api/admin/password/recover`               | Public (rate-limited); recovery phrase + Turnstile → new password  |
| `POST`               | `/api/admin/recovery/regenerate`            | Session + current password; returns new phrase once                |
| `DELETE`             | `/api/admin/users/:id`                      | Session (remove another admin)                                     |
| `PUT`                | `/api/admin/branding`                       | Session                                                            |
| `PUT`                | `/api/admin/origin`                         | Session                                                            |
| `POST`               | `/api/admin/mode`                           | Session                                                            |
| `PUT`                | `/api/admin/schedule`                       | Session                                                            |
| `POST`               | `/api/admin/pause`                          | Session                                                            |
| `PUT`                | `/api/admin/health`                         | Session                                                            |
| `POST`               | `/api/admin/reset`                          | Bearer `TOKEN_SECRET` only                                         |

Operator routes `/admit`, `/mode`, `/pause`, and `/metrics` accept either the admin session cookie or `TOKEN_SECRET` via Bearer / `X-TideGuard-Operator`.

## Emergency reset

If you lose all admin passwords (local or staging):

```bash
curl -X POST https://<host>/api/admin/reset \
  -H "Authorization: Bearer $TOKEN_SECRET"
```

Then reopen `/admin` and run the wizard again. This clears admin users, invites, audit log, origin override, bypass, geo, Turnstile, webhooks, and setup-pending; branding keys are left as-is unless you overwrite them in the next setup.
