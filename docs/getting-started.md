# Getting started

Deploy TideGuard on Cloudflare, or run it locally with Wrangler.

## Prerequisites

- Node.js 20+
- A Cloudflare account (for deploy)
- `npm` (Wrangler is a local project dependency)

## 1. Clone and install

```bash
git clone https://github.com/TideGuard/TideGuard.git
cd TideGuard
npm install
npm run types
```

## 2. Local secrets

```bash
cp .dev.vars.example .dev.vars
openssl rand -hex 32
# paste the value into .dev.vars as TOKEN_SECRET=...
```

`.dev.vars` is gitignored. Never commit real secrets.

## 3. Run locally

```bash
npm run dev
```

| URL                                      | What it is                                          |
| ---------------------------------------- | --------------------------------------------------- |
| http://localhost:8787                    | Landing (redirects to `/admin` until setup is done) |
| http://localhost:8787/wait?queue=default | Waiting room                                        |
| http://localhost:8787/demo               | Protected demo (needs admission)                    |
| http://localhost:8787/admin              | First-run wizard, then control room                 |
| http://localhost:8787/cost               | Cost calculator                                     |
| http://localhost:8787/health             | Health JSON                                         |

### First-run admin

1. Open `/` or `/admin` (unfinished setups redirect from `/`).
2. Paste your `TOKEN_SECRET`, choose a **username** and password.
3. **Cloudflare:** create an API token (link in the wizard), paste token + Zone ID + hostname → **Click to verify**. Use Fix setup / Set Full (strict) / Attach custom domain as prompted.
4. **Turnstile:** create the widget, complete the challenge → **Click to verify**.
5. Choose queue / mode, then branding → Finish setup.
6. You are signed in with an HttpOnly session cookie. Later logins require Turnstile.
7. Visit `/demo` (or `/wait`) as a visitor to exercise the line.

Without `Authorization: Bearer <TOKEN_SECRET>`, setup is rejected so a public Workers URL cannot be claimed by a stranger. Localhost is included on the Turnstile widget domains for `npm run dev`.

Details: [admin.md](admin.md). Before production traffic: [launch-checklist.md](launch-checklist.md).

## 4. Deploy to Cloudflare

### Option A: Deploy button

Use **Deploy to Cloudflare** on the [README](../README.md). Cloudflare clones the repo, provisions KV and Durable Objects from `wrangler.jsonc`, and deploys the Worker named `tideguard`.

When prompted, set:

```text
TOKEN_SECRET=<output of openssl rand -hex 32>
```

### Option B: Wrangler CLI

```bash
npm run deploy
npx wrangler secret put TOKEN_SECRET
```

Placeholder KV IDs in `wrangler.jsonc` are intentional. Deploy-to-Cloudflare / Wrangler can replace them with real resource IDs on first provision.

After deploy:

1. Attach a custom domain or route (see [protecting-origin.md](protecting-origin.md)).
2. Open `https://<your-host>/admin` (or `*.workers.dev/admin` if you have not attached a domain yet).
3. Finish the setup wizard.
4. Smoke-test `/wait`, `/demo`, and `/cost`.

Later releases: do **not** click Deploy to Cloudflare again. Follow [upgrading.md](upgrading.md) (merge upstream or `git pull`, then redeploy / push to Workers Builds).

## 5. Verify

```bash
npm run ci
curl -s http://localhost:8787/health
curl -s "http://localhost:8787/api/cost-estimate?visitors=100000&averageWaitSeconds=60"
```

## Configuration cheat sheet

| Knob                             | Where                            | Notes                                        |
| -------------------------------- | -------------------------------- | -------------------------------------------- |
| Capacity / admit rate / timeouts | `wrangler.jsonc` → `vars`        | Restart / redeploy to apply                  |
| Default admission mode           | `ADMISSION_MODE` var or `/admin` | Live switch via admin or `POST /mode`        |
| Branding + depth display         | `/admin` → Save branding         | KV write on save only                        |
| Admin password                   | `/admin` wizard                  | PBKDF2 hash in KV; reset with `TOKEN_SECRET` |
| Cloudflare API token / Turnstile | `/admin` setup + Cloudflare panel | Required on first claim; seals token + Turnstile secret in KV |

Full var table: [README configuration](../README.md#configuration)  
API reference: [api.md](api.md)
