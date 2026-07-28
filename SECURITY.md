# Security

TideGuard protects capacity with a waiting room and signed admission tokens.

## Reporting a vulnerability

Please open a private GitHub security advisory when possible, or contact the maintainers through the repository. Do not open a public issue for sensitive reports.

Include:

- A description of the issue
- Steps to reproduce
- Impact assessment if known

## Hardening notes

- Keep `TOKEN_SECRET` long, random, and unique per deployment
- Rotate the secret if it may have leaked (invalidates outstanding tokens)
- Never commit `.dev.vars` or production secrets
- Treat Durable Object queue state as authoritative; do not trust client-reported position
