# Documentation

TideGuard docs are short on purpose. Start with the guide that matches your job.

| Guide                                                 | Audience                                                                          |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| [Getting started](getting-started.md)                 | Operators deploying or running locally for the first time                         |
| [Upgrading](upgrading.md)                             | Pull a newer TideGuard into an existing Cloudflare deploy                         |
| [Launch checklist](launch-checklist.md)               | Pre-production go-live review                                                     |
| [Protecting a domain or origin](protecting-origin.md) | Putting Cloudflare + TideGuard in front of a real site or service                 |
| [Verifying admission](verifying-admission.md)         | Redirect URL, click-to-enter hold, how to verify tokens at the origin             |
| [Architecture](architecture.md)                       | Engineers who need the Workers / Durable Object / KV story                        |
| [API](api.md)                                         | Anyone integrating join, status, tokens, or operator routes                       |
| [Admin](admin.md)                                     | Operators using setup (Cloudflare + Turnstile), team invites, audit log, branding |
| [Analytics](analytics.md)                             | Control-room charts for queue depth, wait, and geo-block hits                     |
| [IP allowlist](ip-allowlist.md)                       | Staff bypass, Pass queue, and Cloudflare zone helpers from admin                  |
| [Country block](geo-block.md)                         | Temporary event-window geo gate via `CF-IPCountry`                                |
| [Load testing](load-testing.md)                       | Contributors validating queue behavior at scale                                   |

Project overview and sales pitch live in the root [README](../README.md). Primary website: [tideguard.dev](https://tideguard.dev). Security expectations live in [SECURITY.md](../SECURITY.md).
