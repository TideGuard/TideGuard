# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Site operators** deploying TideGuard on Cloudflare to protect origin capacity during launches and spikes.
- **Visitors** who land on a protected page or embed and need a clear, calm wait with position and ETA.
- **Contributors** extending and maintaining the open-source Worker.

## Product Purpose

TideGuard is a lightweight waiting room for Cloudflare Workers. It queues visitors fairly (FIFO or lottery), admits them at a controlled rate, and issues signed access tokens for protected resources. Success means a product that is cheap to run and trustworthy under load.

Primary website: https://tideguard.dev  
Source repository: https://github.com/TideGuard/TideGuard  
Published docs: https://tideguard.dev/docs/

## Positioning

An open-source, edge-native waiting room on Cloudflare Workers + Durable Objects: hold spike traffic at the edge, admit at a rate the origin can survive, with queue logic operators and contributors can read. Commercial waiting rooms are often expensive and opaque; TideGuard is the opposite shape.

## Operating Context

- Operators deploy via Workers / Deploy-to-Cloudflare, claim `/admin`, then configure queue, branding, Cloudflare zone helpers, and Turnstile without routine dashboard hopping.
- Visitors wait on `/wait` (full page or embed), see place/ETA when enabled, keep the page open through timeslot updates, then continue with a signed admission cookie.
- Contributors work in the Worker + React admin SPA; canonical guides live under `docs/` and `AGENTS.md`.

## Capabilities and Constraints

- Authoritative queue membership and order live in one Durable Object per queue name (not KV).
- Hot path (join / status / heartbeat) must not write KV; status check-ins use timeslots (~750 RPS budget); `nextCheckAt` is deferred until `opensAt` when the room is still scheduled closed.
- Public join/status expose `admissionOpen`, optional future `opensAt`, and `nextCheckAt` (next place update); pause and origin-health throttle stay silent to visitors.
- Queue Mode (FIFO) or Lottery Mode; live admit-rate override; optional origin health throttle; max waiting visitors cap.
- Branding and visitor UX should stay calm and concrete (position, wait, access granted).

## Brand Commitments

**Name / voice:** TideGuard — calm, tidal, precise. Feels like controlled water pressure: protective without panic, technical without coldness. Copy stays concrete (position, wait time, access granted).

**Do not use (binding anti-references):**

- Purple-gradient AI SaaS landing tropes
- Dense “ops dashboard” chrome on the visitor waiting experience
- Cartoonish progress gimmicks or emoji-heavy urgency
- Dark neon / cyberpunk glow aesthetics

Waiting-room brand font (Fraunces) is established in product branding defaults; do not casually replace it in scoped feature work.

## Evidence on Hand

- Operator and contributor docs: `docs/`, `README.md`, `AGENTS.md`, `PRODUCT.md`
- Public site and docs: https://tideguard.dev · https://tideguard.dev/docs/
- Open-source source tree: https://github.com/TideGuard/TideGuard
- Do not invent testimonials, customer names, pricing comparisons, or unmeasured performance claims for marketing surfaces.

## Product Principles

1. **One job per surface** — waiting room shows place in line; protected demo shows access; admin shows control and first-run setup.
2. **Calm under load** — visitors should feel informed, not rushed (including long gaps between updates deep in line).
3. **Cost-aware UX** — adaptive / timeslot status polls; never write KV on heartbeat/status.
4. **Clear craft** — architecture and UI should stay easy to follow and maintain.
5. **Stay in TideGuard when possible** — Cloudflare zone checks and Turnstile for admin login are driven from `/admin` after a one-time API token.

## Accessibility & Inclusion

- Target WCAG 2.2 AA contrast for body text and controls.
- Respect `prefers-reduced-motion`.
- Waiting updates must remain readable without relying on color alone (position + text status).
