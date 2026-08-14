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

Claims: `sub` (visitor id), `queue`, `iat`, `exp` (unix seconds), and `epoch` (the queue's
admission-revocation generation).

Accept the token from:

1. Cookie `tg_access` (HttpOnly, set after join/enter)
2. `Authorization: Bearer <token>`
3. Query `?accessToken=` (avoid in production URLs that get logged)

Verify with the same `TOKEN_SECRET` as the Worker (timing-safe compare). Reject missing, bad
signature, wrong queue, expired `exp`, or an `epoch` that does not match the queue's current epoch
(legacy tokens without the claim are epoch `0`).

Admission TTL is fixed when the token is issued. Requests made with the token do not extend `exp`;
there is no sliding expiration. An operator can revoke all admissions immediately from the admin
danger zone, independently of the remaining TTL.

The recommended server-side integration is `@tideguard/verify`:

```js
import { verifyAccessToken } from "@tideguard/verify";

const claims = await verifyAccessToken(token, process.env.TOKEN_SECRET, {
  expectedQueue: "default",
});
```

The Worker reference implementation remains `src/auth/token.ts`. Never expose `TOKEN_SECRET` or token signing to browsers.

## Redirect after admission

Priority for where visitors go after they get through:

1. `?return=` on `/wait` (same-origin relative path only)
2. Admin branding **Default redirect path** (`redirectUrl`, e.g. `/checkout`)
3. `/` when origin proxy is enabled, otherwise `/demo`

Open redirects are rejected (`//evil.com`, absolute URLs, etc.).

## Click-to-enter (optional)

In `/admin` branding:

| Setting                    | Effect                                                                   |
| -------------------------- | ------------------------------------------------------------------------ |
| **Require click to enter** | Show a Continue button instead of auto-redirect                          |
| **Admit hold (seconds)**   | How long the admitted spot is kept before release (15–900, default 120)  |
| **Enter button label**     | Button text (default `Continue`)                                         |
| **Play turn notification** | Play `/sounds/notification.mp3` when Continue appears (visitor-muteable) |

Flow:

1. Visitor is admitted but **not yet entered** — no `accessToken` / `tg_access` yet
2. They must `POST /enter` (waiting room button) within the hold window
3. Only then is the HMAC cookie issued and redirect happens
4. If the hold expires, the spot is released and they rejoin the line

Server enforces the hold (Durable Object sweep), not only the browser timer.

## Embed / iframe widget

Use `/wait?embed=1&return=/checkout` inside an iframe on a marketing host while the gated host runs TideGuard.

- Compact layout (no full-bleed tide background); `html.is-embed`
- Posts `postMessage({ type: "tideguard-embed-height", height })` so the parent can resize
- Optional `?lang=en|de|fr|es|ja` overrides automatic `Accept-Language` selection
- Progressbar / status regions use `aria-live="polite"` and a labeled progressbar

Example:

```html
<iframe
  src="https://gate.example.com/wait?embed=1&return=/checkout"
  title="Waiting room"
  style="width:100%;border:0;min-height:28rem"
></iframe>
<script>
  window.addEventListener("message", (e) => {
    if (e.data?.type === "tideguard-embed-height") {
      const el = document.querySelector("iframe[title='Waiting room']");
      if (el) el.style.height = `${e.data.height}px`;
    }
  });
</script>
```

The Branding tab in `/admin` shows the same snippet for your queue.
