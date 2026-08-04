# TOKEN_SECRET rotation

`TOKEN_SECRET` is the master key for a TideGuard Worker. Rotate it only when you suspect a leak or are rebuilding a deployment on purpose.

## Blast radius

The same secret:

- Signs visitor `tg_access` / `tg_ticket` cookies
- Signs admin session cookies
- Seals Cloudflare API tokens and Turnstile secrets in KV
- Authorizes Bearer / `X-TideGuard-Operator` operator routes
- Seals optional webhook signing secrets

After cutover, **all outstanding visitor tokens and admin sessions fail immediately**. Sealed KV blobs that were encrypted with the old secret cannot be opened until you re-enter those credentials in `/admin`.

## Generate a new secret

```bash
# Interactive checklist + prints the wrangler put command
npm run rotate:token-secret

# Or generate only
openssl rand -hex 32
# https://tideguard.dev/token
```

## Cutover steps

1. Keep the **old** secret written down until the new deploy works.
2. Set the new secret on the Worker:
   ```bash
   npx wrangler secret put TOKEN_SECRET
   ```
   (Paste the new value when prompted. Deploy-to-Cloudflare forks: update the secret in the dashboard / Builds UI.)
3. Expect `/admin` login cookies and live waiting-room admissions to break until operators re-auth.
4. Sign in again (Turnstile still required). If Cloudflare / Turnstile panels show missing credentials, re-paste the API token and Turnstile secret under **Cloudflare** (or factory-reset and re-run the wizard on non-prod).
5. Smoke-test `/wait?return=/demo`, then Pass queue / force-admit once.
6. If you use [operator webhooks](webhooks.md) with a signing secret, re-save the signing secret (it was sealed with the old `TOKEN_SECRET`).
7. Discard the old secret only after the checklist above is green.

## Admin UI

**System → TOKEN_SECRET rotation** shows the same checklist with an acknowledgment gate. It does not change the Worker secret for you — Wrangler / the dashboard must.

## Related

- [SECURITY.md](../SECURITY.md)
- [Upgrading](upgrading.md)
- [Admin](admin.md)
- [Webhooks](webhooks.md)
