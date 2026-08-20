# Secret rotation

TideGuard supports four secrets. Existing installs may still use only `TOKEN_SECRET`; specialised secrets fall back to it until you set them.

| Secret                 | Rotate when…                             | Side effects                                                             |
| ---------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| `TOKEN_SECRET`         | Operator / emergency key may have leaked | Invalidates claim Bearer; re-seal may be needed if seal falls back to it |
| `ADMISSION_SECRET`     | Visitor token key may have leaked        | Invalidates live `tg_access` / `tg_ticket` — **do not rotate mid-event** |
| `ADMIN_SESSION_SECRET` | Admin session key may have leaked        | All operators must log in again once                                     |
| `SEAL_SECRET`          | KV seal key may have leaked              | Re-open or re-save Cloudflare / Turnstile / webhook secrets in `/admin`  |

## Prefer split secrets

Give origin backends **only** `ADMISSION_SECRET` for [`@tideguard/verify`](../packages/verify/README.md). Never put any secret in browser code.

```bash
npx wrangler secret put ADMISSION_SECRET
npx wrangler secret put ADMIN_SESSION_SECRET
npx wrangler secret put SEAL_SECRET
```

Deploy-to-Cloudflare still prompts for `TOKEN_SECRET` only. Add the others after the first deploy.

## Blast radius of TOKEN_SECRET alone

If you have not set the specialised secrets yet, `TOKEN_SECRET` still:

- Signs visitor admission tokens and tickets
- Signs admin session cookies
- Seals Cloudflare API tokens, Turnstile secrets, and webhook signing secrets in KV
- Authorizes Bearer / `X-TideGuard-Operator` operator routes and factory reset

A leak of that single value compromises the whole deployment — rotate immediately and then introduce split secrets.

## Generate a new secret

```bash
# Interactive checklist + prints the wrangler put command
npm run rotate:token-secret

# Or generate only
openssl rand -hex 32
# https://tideguard.dev/token
```

## Cutover steps (TOKEN_SECRET)

1. Keep the **old** secret written down until the new deploy works.
2. Set the new secret on the Worker:
   ```bash
   npx wrangler secret put TOKEN_SECRET
   ```
3. Expect `/admin` login cookies and live waiting-room admissions to break until operators re-auth **if** specialised secrets still fall back to `TOKEN_SECRET`.
4. Sign in again (Turnstile still required). If Cloudflare / Turnstile panels show missing credentials, re-paste the API token and Turnstile secret under **Cloudflare**.
5. Smoke-test `/wait?return=/demo`, then Pass queue / force-admit once.
6. If you use [operator webhooks](webhooks.md) with a signing secret, re-save the signing secret when seal still depends on `TOKEN_SECRET`.
7. Discard the old secret only after the checklist above is green.

## Adding ADMIN_SESSION_SECRET

Setting a dedicated session secret invalidates cookies signed with `TOKEN_SECRET`. Operators log in again once. Bearer operator auth continues to use `TOKEN_SECRET` only.

## Changing ADMISSION_SECRET

Invalidates outstanding visitor tokens and queue tickets immediately. Rotate only between events, then smoke-test `/join` and origin verification with the new secret.

## Changing SEAL_SECRET

New seals use `v2` blobs. Legacy `v1` blobs sealed with `TOKEN_SECRET` remain readable and are re-sealed to `v2` on successful read when `SEAL_SECRET` is set. If decrypt fails, TideGuard does **not** delete the KV value — re-enter credentials in `/admin`.

## Admin UI

**System → TOKEN_SECRET rotation** shows the operator-secret checklist with an acknowledgment gate. It does not change Worker secrets for you — Wrangler / the dashboard must.

## Related

- [SECURITY.md](../SECURITY.md)
- [Upgrading](upgrading.md)
- [Admin](admin.md)
- [Webhooks](webhooks.md)
- [Verifying admission](verifying-admission.md)
