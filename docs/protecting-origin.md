# Protecting a domain or origin

TideGuard is a Cloudflare Worker that sits **in front of** the thing you want to protect. Visitors without a valid admission token go to the waiting room. Admitted visitors are **proxied** to your origin with the same path and query string.

## Mental model

```text
Internet
   │
   ▼
Cloudflare (DNS + TLS)  →  your hostname points at TideGuard
   │
   ▼
TideGuard Worker
   │
   ├─ /wait /admin /join …     → TideGuard control plane (never proxied)
   ├─ no admission token       → 302 /wait?return=<path>
   └─ valid token              → fetch(ORIGIN + path)  (origin proxy)
```

## Demo mode (smoke-test without gating the site)

After setup finishes, TideGuard stays in **demo mode** until you enable origin protection: the Worker does not gate real site paths. Exercise the line at `/demo` or `/wait?return=/demo` (incognito is best). The control room shows a **Demo mode** banner with **Go live** (enables proxy + protect-all once an Origin URL is set).

Demo mode is on when origin proxy is disabled, or when proxy is enabled but protect-all is off and no path prefixes are configured.

## Enable the origin proxy

### Option A: Admin UI (recommended)

1. Deploy TideGuard and finish `/admin` setup (you start in demo mode).
2. Open **Access → Origin proxy**, or use **Go live** from the demo-mode banner.
3. Set **Origin URL** to your upstream, e.g. `https://shop.example.com`.
4. Leave **Protect all non-TideGuard paths** on (or list prefixes like `/checkout,/account`).
5. **Save origin proxy** (or confirm **Go live**).

Settings are stored in KV (`admin:origin`) and apply without redeploying.

### Option B: Wrangler vars

In `wrangler.jsonc`:

```jsonc
"ORIGIN_URL": "https://shop.example.com",
"ORIGIN_PROTECT_ALL": "true",
"ORIGIN_PATH_PREFIXES": ""
```

| Var                    | Meaning                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| `ORIGIN_URL`           | Absolute upstream origin (`https://host`). Empty disables env-based proxy. |
| `ORIGIN_PROTECT_ALL`   | `true` = every non-reserved path needs admission                           |
| `ORIGIN_PATH_PREFIXES` | Comma list when protect-all is false, e.g. `/checkout,/account`            |

Admin KV overrides env when both are set.

## Put TideGuard on your hostname

You need an active Cloudflare zone for the hostname, then a Workers custom domain on the TideGuard Worker.

**DNS choice (read this first):** [custom-domain.md](custom-domain.md) — full setup (move nameservers, Free/Pro OK) vs partial CNAME setup (Business/Enterprise; keep your current DNS provider).

Short path once the zone is ready:

1. Deploy the Worker.
2. Attach the hostname (TideGuard **Cloudflare access** → Attach custom domain, or Worker → **Domains & Routes**).
3. Confirm DNS is proxied (orange cloud).
4. Open `https://your-host/admin`, enable origin proxy, smoke-test.

Docs: [Custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) · [Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)

## What gets proxied

**Always TideGuard (not proxied):**

`/health`, `/wait`, `/join`, `/status`, `/leave`, `/heartbeat`, `/enter`, `/admit`, `/mode`, `/pause`, `/metrics`, `/admin`, `/api/admin/*`, `/cost`, `/api/cost-estimate`, `/demo`

**When proxy is enabled:** everything else (including `/`) is forwarded to `ORIGIN_URL` + path + query.

Protected paths require cookie `tg_access` (or Bearer / `?accessToken=`). Missing token → redirect to `/wait?queue=…&return=…`.

After admission, waiting room redirect order is: `?return=` → branding `redirectUrl` → `/` when proxy is on.

**How to verify admitted users at your origin:** [verifying-admission.md](verifying-admission.md).

### Request headers added upstream

| Header                | Value                         |
| --------------------- | ----------------------------- |
| `Host`                | Origin host                   |
| `X-Forwarded-Host`    | Public hostname visitors used |
| `X-Forwarded-Proto`   | `http` / `https`              |
| `X-TideGuard-Visitor` | Admitted visitor id           |
| `X-TideGuard-Proxy`   | `1`                           |

Hop-by-hop and Cloudflare edge headers are stripped before the upstream fetch.

**Cookie / auth isolation**

- Request `Cookie` values whose names start with `tg_` are never forwarded
- Request `Authorization` is never forwarded
- Upstream `Set-Cookie` is stripped so the gate hostname cannot be polluted by origin sessions

## Lock down the origin

TideGuard is only as strong as origin exposure. Without locking the origin, someone who knows your upstream URL can bypass the waiting room.

### Lock the origin to Cloudflare (required for production)

1. **SSL/TLS mode: Full (strict)** — Cloudflare verifies a valid certificate on the origin.
2. **Authenticated Origin Pulls (AOP)** — Cloudflare presents a client certificate on every connection to your origin. Configure your origin (or load balancer) to **require** that client certificate and reject other TLS clients.
   - Dashboard: SSL/TLS → Origin Server → Authenticated Origin Pulls (or per-hostname / per-zone API).
   - Docs: [Authenticated Origin Pulls](https://developers.cloudflare.com/ssl/origin-configuration/authenticated-origin-pull/)
3. Prefer an origin that is **not** publicly reachable except through Cloudflare (Tunnel, private network, or firewall allowlist of Cloudflare IP ranges).
4. Do not place secrets in query strings that TideGuard would proxy unchanged.
5. Origin URLs must be public hosts — loopback and RFC1918 addresses are rejected (SSRF guard).

Without AOP (or equivalent mutual TLS / private networking), a leaked `ORIGIN_URL` can be hit directly and skip TideGuard.

**Later:** Custom Origin Trust Store and post-quantum (ML-DSA) certificates can harden the same Cloudflare↔origin hop further — see [Cloudflare’s PQ origin auth announcement](https://blog.cloudflare.com/post-quantum-authentication-to-origins/).

## Cloudflare Bot Fight Mode and WAF

Keep Bot Fight Mode, Super Bot Fight Mode, and WAF rules **on**. TideGuard is a Worker in front of your site — zone security and the waiting room stack, they do not replace each other.

Admin login already uses **Turnstile**. The waiting room uses signed tickets and capacity limits for surge control. Bot Fight Mode still helps against scrapers and automated abuse hitting your hostname.

### When waiting-room polls look broken

Bot Fight Mode may challenge traffic that looks automated. Real browsers on `/wait` are usually fine. Problems show up when challenges hit TideGuard **control paths** used by `fetch` from the waiting room (or by custom clients):

`/join`, `/status`, `/leave`, `/heartbeat`, `/enter`

Symptoms: waiting UI stuck on “Connecting…”, status polls returning challenge HTML instead of JSON, or heartbeats failing in Security Events.

### Coexistence (preferred): Skip rule for ticketed visitors

In **Security → WAF → Custom rules**, add a **Skip** action (skip Bot Fight / Super Bot Fight / relevant managed checks) when the visitor already has a TideGuard cookie:

```text
(http.request.uri.path in {"/join" "/status" "/leave" "/heartbeat" "/enter"})
and (
  http.cookie contains "tg_ticket="
  or http.cookie contains "tg_access="
)
```

That keeps Bot Fight on the rest of the site (marketing, checkout, APIs) while the waiting room’s machine-looking polls are not challenged mid-line.

Narrower alternative: Skip only `/status` and `/heartbeat` if join still needs a challenge at first contact.

### If you use Managed Challenges elsewhere

Prefer path- or cookie-scoped rules over turning Bot Fight off for the whole zone. Check **Security → Events** for the TideGuard hostname when debugging; challenge or block actions there usually explain a silent waiting-room failure faster than Worker logs.

## Patterns

### Full site gate

Hostname `www.example.com` → TideGuard Worker · Origin URL `https://origin.internal` · Protect all on.

Marketing, checkout, and APIs on that host all pass through the waiting room once.

### Path gate only

`ORIGIN_PROTECT_ALL=false` · prefixes `/checkout,/account` · other paths still proxied **without** requiring a token (passthrough). Use when only some URLs need the line.

### Embed waiting room

Keep marketing on another host; iframe `/wait?embed=1&return=/checkout` on the gated host.

## Checklist

| Step                               | Done when                                            |
| ---------------------------------- | ---------------------------------------------------- |
| Worker on hostname                 | `/health` OK                                         |
| `/admin` setup done                | You can sign in                                      |
| Origin proxy saved                 | Admin shows enabled + URL                            |
| Full (strict) + AOP                | Origin rejects non-Cloudflare TLS clients            |
| Unauthenticated `/` or `/checkout` | Redirects to `/wait`                                 |
| After wait                         | Proxied origin content loads with `tg_access` cookie |

## Related

- [Getting started](getting-started.md)
- [Admin](admin.md)
- [Architecture](architecture.md)
- [API](api.md)
- [Verifying admission](verifying-admission.md)
- [IP allowlist](ip-allowlist.md)
- [Country block](geo-block.md)
- [tideguard.dev](https://tideguard.dev)
