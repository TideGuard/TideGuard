# Launch checklist

Use this before pointing production traffic at TideGuard.

## Secrets and admin

- [ ] `TOKEN_SECRET` set via Wrangler secret / Deploy-to-Cloudflare ([tideguard.dev/token](https://tideguard.dev/token) or `openssl rand -hex 32`)
- [ ] `/admin` setup completed: Claim (TOKEN_SECRET + username/password) + **Cloudflare verify** + **Turnstile verify** + Finish
- [ ] Per-admin passwords stored offline; login uses Turnstile after finish
- [ ] Recovery phrases saved for each admin (Forgot password)
- [ ] Extra operators invited via Team panel (72h links), not by sharing one password
- [ ] Custom domain attached ([custom-domain.md](custom-domain.md)) — full NS or partial CNAME as applicable
- [ ] Cloudflare panel: DNS proxied, IP Geolocation as needed, SSL Full (strict) if origin is ready

## Capacity

| Setting                | Where                       | Guidance                                                              |
| ---------------------- | --------------------------- | --------------------------------------------------------------------- |
| `MAX_CONCURRENT_USERS` | Code default / optional env | Origin concurrent capacity you can actually serve                     |
| `ADMIT_PER_SECOND`     | `/admin` traffic (or env)   | Steady admit rate once the room is full                               |
| `TOKEN_TTL_SECONDS`    | Code default / optional env | How long an admission cookie remains valid                            |
| Timeslot check-ins     | Waiting UI (default)        | `nextCheckAt`; period = max(5s, ceil(waiting/750)); status ≤ ~750/s   |
| Fixed poll override    | Env (optional)              | `WAITING_ROOM_*_INTERVAL_MS` — not recommended; budgets DO requests   |
| Heartbeat timeout      | Worker vars (`180`)         | Drop silent waiters; timeslot period stays under half this window     |
| Max waiting visitors   | `/admin` Danger zone        | Default **1M** safety cap (not a seat fee); `/join` → `503 queue_full` when full; raisable to 50M |
| `QUEUE_TIMEOUT_SECONDS`| Code default (`86400`)      | Max stay in pool (24h); too-short values expire deep timeslots        |

Rough DO request volume while waiting (timeslot status-only):

```text
periodSec = max(5, ceil(waiting / 750))
statusRps ≈ waiting / periodSec   # ≤ 750 once waiting ≥ 3750
visitors × (1 join + waitSeconds / periodSec)
```

Fixed-interval override (discouraged) still follows:

```text
visitors × (1 join + waitSeconds/pollInterval + waitSeconds/heartbeatInterval)
```

Use `/cost` for Cloudflare Workers paid-plan estimates (adaptive by default).

## Origin proxy

- [ ] Left demo mode: origin proxy enabled with protect-all or path prefixes ([protecting-origin.md](protecting-origin.md#demo-mode-smoke-test-without-gating-the-site))
- [ ] Origin URL is a **public** `https://` host (loopback / private IPs are rejected)
- [ ] Origin only accepts traffic from Cloudflare — **Full (strict)** SSL + **Authenticated Origin Pulls** (see [protecting-origin.md](protecting-origin.md))
- [ ] Protected path smoke-test: unauthenticated → `/wait`; admitted → origin content
- [ ] Confirmed TideGuard cookies (`tg_*`) are **not** forwarded upstream
- [ ] Bot Fight / WAF left **on**; if waiting-room polls fail, add a Skip rule for ticketed `/join` `/status` `/leave` `/heartbeat` `/enter` (see [protecting-origin.md](protecting-origin.md#cloudflare-bot-fight-mode-and-waf))

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
- [ ] `/demo` (or origin path) loads with a valid admission cookie
- [ ] Origin sees `X-TideGuard-Visitor` when proxying (or your app verifies HMAC)
- [ ] Operator-auth `GET /metrics?queue=…` shows expected waiting/admitted / pause / health
- [ ] Public join/status omit depth unless Show depth is enabled
- [ ] Admin branding Save writes KV once; polls do not

## Related

- [Getting started](getting-started.md)
- [Upgrading](upgrading.md)
- [Protecting origin](protecting-origin.md)
- [SECURITY.md](../SECURITY.md)
