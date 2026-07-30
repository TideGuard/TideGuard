# Product

## Register

product

## Users

- **Site operators** deploying TideGuard on Cloudflare to protect origin capacity during launches and spikes.
- **Visitors** who land on a protected page or embed and need a clear, calm wait with position and ETA.
- **Contributors** extending and maintaining the open-source Worker.

## Product Purpose

TideGuard is a lightweight waiting room for Cloudflare Workers. It queues visitors fairly (FIFO), admits them at a controlled rate, and issues signed access tokens for protected resources. Success means a product that is cheap to run and trustworthy under load.

Primary website: https://tideguard.dev

## Brand Personality

Calm, tidal, precise.

The product should feel like controlled water pressure: protective without panic, technical without coldness. Copy stays concrete (position, wait time, access granted).

## Anti-references

- Purple-gradient AI SaaS landing tropes
- Dense “ops dashboard” chrome on the visitor waiting experience
- Cartoonish progress gimmicks or emoji-heavy urgency
- Dark neon / cyberpunk glow aesthetics

## Design Principles

1. **One job per surface** — waiting room shows place in line; protected demo shows access; admin shows control and first-run setup.
2. **Calm under load** — visitors should feel informed, not rushed.
3. **Tokens over chrome** — colors and fonts are CSS variables so branding can change without rewriting layout.
4. **Cost-aware UX** — poll every few seconds; never write KV on heartbeat/status.
5. **Clear craft** — visuals and architecture should be easy to follow and maintain.
6. **Stay in TideGuard when possible** — Cloudflare zone checks (proxy, geo, SSL, domains) and Turnstile for admin login are driven from `/admin` after a one-time API token, so operators are not bounced through the Cloudflare dashboard for routine setup.

## Accessibility & Inclusion

- Target WCAG 2.2 AA contrast for body text and controls.
- Respect `prefers-reduced-motion`.
- Waiting updates must remain readable without relying on color alone (position + text status).
