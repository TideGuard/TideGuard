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

## Enable the origin proxy

### Option A: Admin UI (recommended)

1. Deploy TideGuard and finish `/admin` setup.
2. Open **Origin proxy** on the control room.
3. Set **Origin URL** to your upstream, e.g. `https://shop.example.com`.
4. Leave **Protect all non-TideGuard paths** on (or list prefixes like `/checkout,/account`).
5. **Save origin proxy**.

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

1. Deploy the Worker.
2. Cloudflare dashboard → Worker → **Domains & Routes** → add custom domain or route.
3. Point DNS at Cloudflare (orange cloud) for that hostname.
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

TideGuard is only as strong as origin exposure:

1. Prefer an origin that is **not** publicly reachable except through Cloudflare (tunnel, private origin, or firewall allowlist of Cloudflare IP ranges).
2. Reject requests that lack Cloudflare / TideGuard markers if you terminate elsewhere.
3. Do not place secrets in query strings that TideGuard would proxy unchanged.
4. Origin URLs must be public hosts — loopback and RFC1918 addresses are rejected (SSRF guard).

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
| Unauthenticated `/` or `/checkout` | Redirects to `/wait`                                 |
| After wait                         | Proxied origin content loads with `tg_access` cookie |

## Related

- [Getting started](getting-started.md)
- [Admin](admin.md)
- [Architecture](architecture.md)
- [API](api.md)
- [Verifying admission](verifying-admission.md)
- [tideguard.dev](https://tideguard.dev)
