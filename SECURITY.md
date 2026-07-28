# Security

TideGuard protects origin capacity with a waiting room and signed admission tokens. This document is for operators and reporters.

## Reporting a vulnerability

Please open a private GitHub security advisory when possible, or contact the maintainers through the repository. Do not open a public issue for sensitive reports.

Include:

- A description of the issue
- Steps to reproduce
- Impact assessment if known

## Threat model (short)

| Trust                                  | Do not trust                                      |
| -------------------------------------- | ------------------------------------------------- |
| Durable Object queue state             | Client-reported position / odds                   |
| HMAC tokens signed with `TOKEN_SECRET` | Unsigned cookies or query params                  |
| Admin session after password verify    | Public `/api/admin/setup` after setup is complete |

## Operator checklist

- Keep `TOKEN_SECRET` long, random, and unique per deployment (`openssl rand -hex 32`)
- Set it via Wrangler secrets / Deploy-to-Cloudflare prompts, never in git
- Complete `/admin` setup promptly after first deploy so the wizard cannot be claimed by someone else on a public URL
- Prefer a strong admin password; it is PBKDF2-hashed in KV
- Rotate `TOKEN_SECRET` if it may have leaked (invalidates outstanding visitor tokens and admin sessions)
- Keep waiting-room poll intervals at 2–3s to limit Durable Object request volume
- Do not use KV as the source of truth for queue membership or ordering

## Related docs

- [Getting started](docs/getting-started.md)
- [Admin](docs/admin.md)
- [API](docs/api.md)
