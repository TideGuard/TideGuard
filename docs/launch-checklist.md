# Launch checklist

Use this before pointing production traffic at TideGuard.

## Secrets and admin

- [ ] `TOKEN_SECRET` set via Wrangler secret / Deploy-to-Cloudflare (`openssl rand -hex 32`)
- [ ] `/admin` setup completed: Bearer TOKEN_SECRET + username/password + **Cloudflare verify** + **Turnstile verify**
- [ ] Strong per-admin passwords stored offline; session cookie is HttpOnly; login protected by Turnstile
- [ ] Confirmed `POST /api/admin/reset` only works with `Authorization: Bearer <TOKEN_SECRET>`
- [ ] Extra operators invited via Team panel (72h links), not by sharing one password
- [ ] Cloudflare panel: DNS proxied, IP Geolocation as needed, SSL Full (strict) if origin is ready, custom domain attached

## Capacity

| Setting                | Where             | Guidance                                          |
| ---------------------- | ----------------- | ------------------------------------------------- |
| `MAX_CONCURRENT_USERS` | Worker vars       | Origin concurrent capacity you can actually serve |
| `ADMIT_PER_SECOND`     | Worker vars       | Steady admit rate once the room is full           |
| `TOKEN_TTL_SECONDS`    | Worker vars       | How long an admission cookie remains valid        |
| Poll interval          | Waiting UI (~15s) | Do not lower without budgeting DO requests        |
| Heartbeat              | Waiting UI (~30s) | Must stay under `HEARTBEAT_TIMEOUT_SECONDS`       |

Rough DO request volume while waiting:

```text
visitors × (1 join + waitSeconds/pollInterval + waitSeconds/heartbeatInterval)
```

Use `/cost` for Cloudflare Workers paid-plan estimates.

## Origin proxy

- [ ] Origin URL is a **public** `https://` host (loopback / private IPs are rejected)
- [ ] Origin only accepts traffic from Cloudflare — **Full (strict)** SSL + **Authenticated Origin Pulls** (see [protecting-origin.md](protecting-origin.md))
- [ ] Protected path smoke-test: unauthenticated → `/wait`; admitted → origin content
- [ ] Confirmed TideGuard cookies (`tg_*`) are **not** forwarded upstream

## Traffic controls

- [ ] Opening time set (or cleared) for launch; `/wait` shows countdown before open
- [ ] Silent pause smoke-tested: admissions stop; waiting UI unchanged
- [ ] Origin health URL is public HTTPS (private hosts rejected); thresholds tuned; override known
- [ ] Understood: one seat per browser profile via ticket; extra devices can take extra seats

## Smoke tests

- [ ] `GET /health` → 200
- [ ] `/wait?queue=…&return=/demo` joins and eventually admits
- [ ] Branding redirect path (if set) lands on the expected same-origin URL
- [ ] Click-to-enter (if enabled): Continue issues cookie; hold expiry rejoins
- [ ] `/demo` (or origin path) loads with HttpOnly `tg_access`
- [ ] Origin sees `X-TideGuard-Visitor` when proxying (or your app verifies HMAC)
- [ ] Operator-auth `GET /metrics?queue=…` shows expected waiting/admitted / pause / health
- [ ] Public join/status omit depth unless Show depth is enabled
- [ ] Admin branding Save writes KV once; polls do not

## Related

- [Getting started](getting-started.md)
- [Upgrading](upgrading.md)
- [Protecting origin](protecting-origin.md)
- [SECURITY.md](../SECURITY.md)
