# Security

TideGuard protects origin capacity with a waiting room and signed admission tokens. This document is for operators and reporters.

## Reporting a vulnerability

Please open a private GitHub security advisory when possible, or contact the maintainers through the repository. Do not open a public issue for sensitive reports.

Include:

- A description of the issue
- Steps to reproduce
- Impact assessment if known

## Threat model (short)

| Trust                                  | Do not trust                       |
| -------------------------------------- | ---------------------------------- |
| Durable Object queue state             | Client-reported position / odds    |
| HMAC tokens signed with `TOKEN_SECRET` | Unsigned cookies or query params   |
| HttpOnly `tg_ticket` / `tg_access`     | Visitor id alone (no ticket)       |
| Named admin sessions after login + Turnstile | Unauthenticated `/api/admin/setup` |
| Hashed invite tokens with 72h TTL            | Long-lived shared admin passwords  |
| Sealed CF API token + Turnstile secret in KV | Client-only CAPTCHA without siteverify |

## Operator checklist

- Keep `TOKEN_SECRET` long, random, and unique per deployment (`openssl rand -hex 32`)
- Set it via Wrangler secrets / Deploy-to-Cloudflare prompts, never in git
- Complete `/admin` setup promptly; first claim requires `Authorization: Bearer TOKEN_SECRET`, Cloudflare API verify, and Turnstile (rate limits alone are not enough for login)
- Prefer strong per-admin passwords (PBKDF2-hashed and salted in KV); use Team invites instead of sharing one password
- Review the Activity panel after launch changes; consequential toggles ask for confirmation
- For production origins: Full (strict) SSL + Authenticated Origin Pulls so the upstream cannot be hit bypassing TideGuard ([protecting-origin.md](docs/protecting-origin.md)) — set Full (strict) from the admin Cloudflare panel when the origin cert is ready
- Consider Cloudflare Access / Zero Trust in front of `/admin` for high-stakes deployments (in addition to Turnstile)
- Rotate `TOKEN_SECRET` if it may have leaked (invalidates outstanding visitor tokens, tickets, and admin sessions)
- Keep waiting-room poll intervals at the default 15s (or higher) to limit Durable Object request volume
- Do not use KV as the source of truth for queue membership or ordering
- Use public origins only; lock the origin so it is not reachable without Cloudflare / TideGuard
- Before go-live, walk through [docs/launch-checklist.md](docs/launch-checklist.md)

## Related docs

- [Getting started](docs/getting-started.md)
- [Admin](docs/admin.md)
- [API](docs/api.md)
