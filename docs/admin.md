# Admin

The admin surface lives at `/admin`. It has three jobs, in order:

1. **First-run setup** (wizard)
2. **Sign in**
3. **Control room** (branding, mode, metrics)

Visitor pages never write KV. Admin does, and only on explicit Save / Finish setup.

## Setup wizard

Shown when `admin:config` is missing from KV.

| Step | You set | Stored when |
| --- | --- | --- |
| 1. Password | Admin password (8–128 chars) | Finish setup |
| 2. Queue | Queue name, Queue vs Lottery, show depth | Finish setup |
| 3. Branding | Title, message, colors | Finish setup (live preview is client-side only) |

On finish, TideGuard:

- Writes a PBKDF2 password hash + salt to KV (`admin:config`)
- Writes branding to KV (`branding:<queue>`)
- Sets admission mode on the queue Durable Object
- Issues an admin session cookie (`tg_admin`)

`TOKEN_SECRET` remains a Wrangler secret. It signs visitor admission tokens and admin session cookies. The wizard does **not** replace it.

## Login

After setup, `/admin` asks for the password. Success sets `tg_admin` (HttpOnly, `SameSite=Lax`, 12h TTL).

## Control room

| Control | Effect |
| --- | --- |
| Live preview | Updates as you edit; no KV write |
| Save branding | One KV put for `branding:<queue>` |
| Apply mode | `queue` or `lottery` on the Durable Object |
| Show depth | Persisted with branding as `showWaitingCount` |
| Metrics | Waiting / admitted / capacity / mode from the DO |

Waiting-room depth UI:

- **Lottery:** In pool  
- **Queue:** Ahead and Behind  

## API (admin)

| Method | Path | Auth |
| --- | --- | --- |
| `GET` | `/api/admin/bootstrap` | Public (`setupComplete`) |
| `POST` | `/api/admin/setup` | Public once |
| `POST` | `/api/admin/login` | Public |
| `POST` | `/api/admin/logout` | Session |
| `GET` | `/api/admin/state` | Session |
| `PUT` | `/api/admin/branding` | Session |
| `POST` | `/api/admin/mode` | Session |
| `POST` | `/api/admin/reset` | `Authorization: Bearer <TOKEN_SECRET>` only |

Operator routes `/admit` and `/mode` accept either the admin session cookie or `TOKEN_SECRET` via Bearer / `X-TideGuard-Operator`.

## Emergency reset

If you lose the admin password (local or staging):

```bash
curl -X POST https://<host>/api/admin/reset \
  -H "Authorization: Bearer $TOKEN_SECRET"
```

Then reopen `/admin` and run the wizard again. This clears `admin:config` only; branding keys are left as-is unless you overwrite them in the next setup.
