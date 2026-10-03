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

| Trust                                                         | Do not trust                           |
| ------------------------------------------------------------- | -------------------------------------- |
| Durable Object queue state                                    | Client-reported position / odds        |
| HMAC visitor tokens signed with `TOKEN_SECRET`                | Unsigned cookies or query params       |
| Admin sessions / seals via `ADMIN_SECRET` (or `TOKEN_SECRET`) | Unauthenticated `/api/admin/setup`     |
| HttpOnly `tg_ticket` / `tg_access`                            | Visitor id alone (no ticket)           |
| Named admin sessions after login + Turnstile                  | Unauthenticated `/api/admin/setup`     |
| Hashed invite tokens with 72h TTL                             | Long-lived shared admin passwords      |
| Sealed CF API token + Turnstile secret in KV                  | Client-only CAPTCHA without siteverify |

## Operator checklist

- Keep `TOKEN_SECRET` long, random, and unique per deployment (`openssl rand -hex 32`)
- Set it via Wrangler secrets / Deploy-to-Cloudflare prompts, never in git
- **Blast radius:** `TOKEN_SECRET` signs visitor admission tokens and tickets (and claim/factory-reset Bearer). Optional `ADMIN_SECRET` signs admin sessions, operator Bearer (`/admit`, `/mode`, `/pause`, `/metrics`), and seals Cloudflare / Turnstile / webhook secrets in KV. When `ADMIN_SECRET` is unset, those uses fall back to `TOKEN_SECRET`. A leak of either key is serious — rotate immediately ([token-secret-rotation.md](docs/token-secret-rotation.md))
- Complete `/admin` setup promptly; first claim requires `Authorization: Bearer TOKEN_SECRET`, Cloudflare API verify, and Turnstile (rate limits alone are not enough for login)
- Prefer strong per-admin passwords (PBKDF2-hashed and salted in KV); use Team invites instead of sharing one password
- Review the Activity panel after launch changes; consequential toggles ask for confirmation
- For production origins: Full (strict) SSL + Authenticated Origin Pulls so the upstream cannot be hit bypassing TideGuard ([protecting-origin.md](docs/protecting-origin.md)) — set Full (strict) from the admin Cloudflare panel when the origin cert is ready
- Keep Bot Fight Mode / WAF enabled; if waiting-room API polls get challenged, use a cookie-scoped Skip rule for TideGuard control paths — do not disable zone bot protection wholesale ([protecting-origin.md](docs/protecting-origin.md#cloudflare-bot-fight-mode-and-waf))
- Consider Cloudflare Access / Zero Trust in front of `/admin` for high-stakes deployments (in addition to Turnstile). Suggested path rules: protect `/admin*` and optionally `/api/admin*`; leave `/wait`, `/join`, `/status`, and visitor paths public. See the **Access** tab in the control room and [Cloudflare Access docs](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/).
- Prefer setting `ADMIN_SECRET` in production so a visitor-token leak does not also forge admin sessions. Follow [docs/token-secret-rotation.md](docs/token-secret-rotation.md) or `npm run rotate:token-secret`. After `ADMIN_SECRET` is set, open Cloudflare / Turnstile / webhooks once (or Send test) so KV seals migrate off `TOKEN_SECRET`.
- Operator webhook URLs are public `https://` only; do not point them at internal hosts. With a signing secret configured, TideGuard will not deliver unsigned payloads if decrypt fails.
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
