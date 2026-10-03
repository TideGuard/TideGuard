# TOKEN_SECRET / ADMIN_SECRET rotation

`TOKEN_SECRET` signs visitor admission tokens and tickets. Optionally set `ADMIN_SECRET` so admin sessions, operator Bearer routes, and KV-sealed credentials use a separate key.

## Blast radius

| Secret                                         | Signs / seals                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `TOKEN_SECRET`                                 | Visitor `tg_access` / `tg_ticket`, claim/factory-reset Bearer                                              |
| `ADMIN_SECRET` (optional; else `TOKEN_SECRET`) | Admin session cookies, operator Bearer / `X-TideGuard-Operator`, sealed CF/Turnstile/webhook secrets in KV |

After rotating `TOKEN_SECRET`, **outstanding visitor tokens fail immediately**. After rotating or introducing `ADMIN_SECRET`, **admin sessions fail** until operators re-login; sealed KV blobs encrypted with the previous admin key may need re-entry of CF/Turnstile/webhook secrets if dual-open cannot decrypt them.

## Introduce ADMIN_SECRET without rotating visitors

1. Generate a new secret: `openssl rand -hex 32` (or https://tideguard.dev/token).
2. Set it on the Worker: `npx wrangler secret put ADMIN_SECRET`
3. Redeploy if needed. Existing visitor tokens keep working (`TOKEN_SECRET` unchanged).
4. Existing sealed KV blobs still open (decrypt tries `ADMIN_SECRET`, then `TOKEN_SECRET`). The first successful open of each seal **re-encrypts it under `ADMIN_SECRET`** so `TOKEN_SECRET` can no longer decrypt that blob.
5. New seals use `ADMIN_SECRET`. Re-login to `/admin` (sessions were signed with the old admin key = previous `TOKEN_SECRET`).
6. Trigger a read of sealed credentials (open Cloudflare / Turnstile / webhook panels, or Send webhook test) so migration re-seal runs — or re-paste secrets if anything still fails to decrypt.

## Rotate TOKEN_SECRET

```bash
# Interactive checklist + prints the wrangler put command
npm run rotate:token-secret

# Or generate only
openssl rand -hex 32
# https://tideguard.dev/token
```

1. Keep the **old** secret written down until the new deploy works.
2. Set the new secret on the Worker:
   ```bash
   npx wrangler secret put TOKEN_SECRET
   ```
3. Expect live waiting-room admissions to break until visitors rejoin. If `ADMIN_SECRET` is unset, admin sessions also break.
4. Sign in again (Turnstile still required). If Cloudflare / Turnstile panels show missing credentials, re-paste under **Cloudflare** (or rotate Turnstile from [`/admin#turnstile`](/admin#turnstile)).
5. Smoke-test `/wait?return=/demo`, then Pass queue / force-admit once.
6. If you use [operator webhooks](webhooks.md) with a signing secret, re-save it if signatures fail.
7. Discard the old secret only after the checklist above is green.

## Admin UI

[`/admin#secret-rotation`](/admin#secret-rotation) shows the TOKEN_SECRET checklist with an acknowledgment gate. It does not change Worker secrets for you — Wrangler / the dashboard must.

## Related

- [Security](../SECURITY.md)
- [Webhooks](webhooks.md)
- [Admin](admin.md)
