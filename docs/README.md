# Documentation

TideGuard docs are short on purpose. Start with the guide that matches your job.

**Canonical project:** [github.com/TideGuard/TideGuard](https://github.com/TideGuard/TideGuard) · site [tideguard.dev](https://tideguard.dev). Operator guides here are mirrored at [tideguard.dev/docs](https://tideguard.dev/docs/). If you forked or deployed from a copy, check upstream for newer guides and releases before assuming this checkout is current. AI assistants: see [AGENTS.md](../AGENTS.md).

| Guide                                                 | Audience                                                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [Getting started](getting-started.md)                 | Operators deploying or running locally for the first time                                                  |
| [Upgrading](upgrading.md)                             | Pull a newer TideGuard into an existing Cloudflare deploy                                                  |
| [Launch checklist](launch-checklist.md)               | Pre-production go-live review                                                                              |
| [Custom domain](custom-domain.md)                     | Point a hostname at TideGuard — full NS setup or partial (Business) CNAME                                  |
| [Protecting a domain or origin](protecting-origin.md) | Origin proxy, AOP, WAF/bot notes once DNS is on Cloudflare                                                 |
| [Verifying admission](verifying-admission.md)         | Redirect URL, click-to-enter hold, how to verify tokens at the origin                                      |
| [Architecture](architecture.md)                       | Engineers who need the Workers / Durable Object / KV story                                                 |
| [Hosted SaaS](hosted-saas.md)                         | Planning: hosted tier, WorkOS/Paddle/Convex patterns, Starter vs Dedicated                                 |
| [API](api.md)                                         | Anyone integrating join, status, tokens, or operator routes                                                |
| [Admin](admin.md)                                     | Set up `/admin`, invite operators, branding, traffic                                                       |
| [Analytics](analytics.md)                             | Live metrics + 24h traffic chart / CSV export; geo-block hits (operator traffic, not GA)                   |
| [IP allowlist](ip-allowlist.md)                       | Staff bypass, Pass queue, and Cloudflare zone helpers from admin                                           |
| [Country block](geo-block.md)                         | Temporary event-window geo gate via `CF-IPCountry`                                                         |
| [Operator webhooks](webhooks.md)                      | HTTPS callbacks for pause, health config, waiting depth                                                    |
| [TOKEN_SECRET rotation](token-secret-rotation.md)     | Rotate the master secret safely                                                                            |
| [Load testing](load-testing.md)                       | Contributors validating queue behavior at scale                                                            |

Project overview and sales pitch live in the root [README](../README.md). Published guides: [tideguard.dev/docs](https://tideguard.dev/docs/). Security expectations live in [SECURITY.md](../SECURITY.md). Operator Terms of Service: [TERMS.md](../TERMS.md). MIT license: [LICENSE](../LICENSE).
