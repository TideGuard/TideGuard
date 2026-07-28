# Verifying admitted visitors

TideGuard decides who may pass the gate. Your origin (or app) must still know _how_ to trust that decision.

## Pattern A — Origin proxy (recommended)

When TideGuard proxies to `ORIGIN_URL`, it verifies the admission token **before** the upstream fetch. Your origin can trust:

| Signal                                 | Meaning                                        |
| -------------------------------------- | ---------------------------------------------- |
| Request reached you through the Worker | TideGuard already checked `tg_access` / Bearer |
| `X-TideGuard-Proxy: 1`                 | Proxied by TideGuard                           |
| `X-TideGuard-Visitor: <id>`            | Admitted visitor id (`sub` claim)              |

TideGuard cookies (`tg_*`) and `Authorization` are **not** forwarded. Do not expect to re-read `tg_access` on the origin.

Lock the origin so traffic cannot bypass Cloudflare / TideGuard. See [protecting-origin.md](protecting-origin.md).

## Pattern B — Your app verifies the HMAC token

Use this when TideGuard is not proxying (e.g. demo `/demo`, or a custom front-end that calls your API with the token).

Admission token format:

```text
base64url(json-claims).base64url(hmac-sha256)
```

Claims: `sub` (visitor id), `queue`, `iat`, `exp` (unix seconds).

Accept the token from:

1. Cookie `tg_access` (HttpOnly, set after join/enter)
2. `Authorization: Bearer <token>`
3. Query `?accessToken=` (avoid in production URLs that get logged)

Verify with the same `TOKEN_SECRET` as the Worker (timing-safe compare). Reject missing, bad signature, wrong queue, or expired `exp`.

In this repo, `verifyAccessToken()` in `src/auth/token.ts` is the reference implementation. Copy that logic into your backend, or call a small Worker route that wraps it — do not expose `TOKEN_SECRET` to browsers.

## Redirect after admission

Priority for where visitors go after they get through:

1. `?return=` on `/wait` (same-origin relative path only)
2. Admin branding **Default redirect path** (`redirectUrl`, e.g. `/checkout`)
3. `/` when origin proxy is enabled, otherwise `/demo`

Open redirects are rejected (`//evil.com`, absolute URLs, etc.).

## Click-to-enter (optional)

In `/admin` branding:

| Setting                    | Effect                                                                  |
| -------------------------- | ----------------------------------------------------------------------- |
| **Require click to enter** | Show a Continue button instead of auto-redirect                         |
| **Admit hold (seconds)**   | How long the admitted spot is kept before release (15–900, default 120) |
| **Enter button label**     | Button text (default `Continue`)                                        |

Flow:

1. Visitor is admitted but **not yet entered** — no `accessToken` / `tg_access` yet
2. They must `POST /enter` (waiting room button) within the hold window
3. Only then is the HMAC cookie issued and redirect happens
4. If the hold expires, the spot is released and they rejoin the line

Server enforces the hold (Durable Object sweep), not only the browser timer.
