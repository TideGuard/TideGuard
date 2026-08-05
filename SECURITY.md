# Security

TideGuard protects origin capacity with a waiting room and signed admission tokens. This document is for operators and reporters.

**Canonical:** [github.com/TideGuard/TideGuard](https://github.com/TideGuard/TideGuard) · [tideguard.dev/security](https://tideguard.dev/security) · published guides [tideguard.dev/docs](https://tideguard.dev/docs/).

## Reporting a vulnerability

Please open a [private GitHub security advisory](https://github.com/TideGuard/TideGuard/security/advisories/new) when possible, or contact the maintainers through the [repository](https://github.com/TideGuard/TideGuard). Do not open a public issue for sensitive reports.

Include:

- A description of the issue
- Steps to reproduce
- Impact assessment if known

## Threat model (short)

| Trust                                        | Do not trust                           |
| -------------------------------------------- | -------------------------------------- |
| Durable Object queue state                   | Client-reported position / odds        |
| HMAC tokens signed with `TOKEN_SECRET`       | Unsigned cookies or query params       |
| HttpOnly `tg_ticket` / `tg_access`           | Visitor id alone (no ticket)           |
| Named admin sessions after login + Turnstile | Unauthenticated `/api/admin/setup`     |
| Hashed invite tokens with 72h TTL            | Long-lived shared admin passwords      |
| Sealed CF API token + Turnstile secret in KV | Client-only CAPTCHA without siteverify |

## Operator checklist

- Keep `TOKEN_SECRET` long, random, and unique per deployment (`openssl rand -hex 32`)
- Set it via Wrangler secrets / Deploy-to-Cloudflare prompts, never in git
- **Blast radius:** the same `TOKEN_SECRET` signs visitor admission tokens and tickets, signs admin session cookies, seals Cloudflare API tokens / Turnstile secrets in KV, and authorizes Bearer operator routes (`/admit`, `/mode`, `/pause`, `/metrics`, factory reset). A leak compromises the whole deployment — rotate immediately
- Complete `/admin` setup promptly; first claim requires `Authorization: Bearer TOKEN_SECRET`, Cloudflare API verify, and Turnstile (rate limits alone are not enough for login)
- Prefer strong per-admin passwords (PBKDF2-hashed and salted in KV); use Team invites instead of sharing one password
- Review the Activity panel after launch changes; consequential toggles ask for confirmation
- For production origins: Full (strict) SSL + Authenticated Origin Pulls so the upstream cannot be hit bypassing TideGuard ([protecting-origin.md](docs/protecting-origin.md)) — set Full (strict) from the admin Cloudflare panel when the origin cert is ready
- Keep Bot Fight Mode / WAF enabled; if waiting-room API polls get challenged, use a cookie-scoped Skip rule for TideGuard control paths — do not disable zone bot protection wholesale ([protecting-origin.md](docs/protecting-origin.md#cloudflare-bot-fight-mode-and-waf))
- Consider Cloudflare Access / Zero Trust in front of `/admin` for high-stakes deployments (in addition to Turnstile). Suggested path rules: protect `/admin*` and optionally `/api/admin*`; leave `/wait`, `/join`, `/status`, and visitor paths public. See the **Access** tab in the control room and [Cloudflare Access docs](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/).
- Rotate `TOKEN_SECRET` if it may have leaked (invalidates outstanding visitor tokens, tickets, and admin sessions). Follow [docs/token-secret-rotation.md](docs/token-secret-rotation.md) or `npm run rotate:token-secret`.
- Prefer adaptive waiting-room polling (default). Fixed intervals via `WAITING_ROOM_POLL_INTERVAL_MS` / `WAITING_ROOM_HEARTBEAT_INTERVAL_MS` are advanced and not recommended — they raise Durable Object request volume
- Do not use KV as the source of truth for queue membership or ordering
- Use public origins only; lock the origin so it is not reachable without Cloudflare / TideGuard
- Before go-live, walk through [docs/launch-checklist.md](docs/launch-checklist.md)

## Related docs

- [Getting started](docs/getting-started.md)
- [TOKEN_SECRET rotation](docs/token-secret-rotation.md)
- [Operator webhooks](docs/webhooks.md)
- [Admin](docs/admin.md)
- [API](docs/api.md)
