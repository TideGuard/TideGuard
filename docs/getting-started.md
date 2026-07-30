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
npm run setup
```

`npm run setup` regenerates Worker Env types (`wrangler types`), creates `.dev.vars` with a generated `TOKEN_SECRET` if needed, prints the admin handoff checklist, and can start `npm run dev`. Use `npm run setup -- --yes` in scripts/CI (no prompts; does not start the long-running dev server unless you also pass `--dev`).

### Or do it by hand

```bash
npm run types
cp .dev.vars.example .dev.vars
openssl rand -hex 32
# paste the value into .dev.vars as TOKEN_SECRET=...
npm run dev
```

`.dev.vars` is gitignored. Never commit real secrets.

## 2. Run locally

After setup (or `npm run dev`):

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
2. **Claim:** paste your `TOKEN_SECRET` (from `.dev.vars` / setup output), choose a **username** and a strong password (8+, uppercase, digit or symbol). This locks the account in and signs you in — browser Back cannot recreate the password.
3. **Cloudflare:** create an API token ([link in the wizard](https://dash.cloudflare.com/profile/api-tokens)) → **verify token** → zone/hostname verify (+ Fix if needed) → **SSL** Set/Skip → **domain** Attach/Skip.
4. **Turnstile:** create the widget, complete the challenge → **Click to verify**.
5. Choose queue / mode, then branding → Finish setup.
6. Later logins use username + password + Turnstile. If you leave mid-wizard, **Sign in** resumes setup (claim is not shown again).
7. Visit `/demo` (or `/wait`) as a visitor to exercise the line.

Claim requires `Authorization: Bearer <TOKEN_SECRET>` so a public Workers URL cannot be taken by a stranger. Localhost is included on the Turnstile widget domains for `npm run dev`.

Details: [admin.md](admin.md). Before production traffic: [launch-checklist.md](launch-checklist.md).

## 3. Deploy to Cloudflare

### Option A: Deploy button

Use **Deploy to Cloudflare** on the [README](../README.md). Cloudflare clones the repo, provisions KV and Durable Objects from `wrangler.jsonc`, and deploys the Worker named `tideguard`.

Generate a secret first (so you can copy it):

- [tideguard.dev/token](https://tideguard.dev/token), or
- `openssl rand -hex 32`

When Deploy prompts for `TOKEN_SECRET`, paste that value (the field starts empty). Keep the same string for the `/admin` Claim step — the Deploy UI masks secrets.

Capacity, admit rate, timeouts, origin URL, queue name, admission mode, Cloudflare API token, Zone ID, and Turnstile are **not** Deploy fields — configure those in `/admin` after deploy (queue knobs boot from code defaults).

### Option B: Wrangler CLI

```bash
npm run deploy
npx wrangler secret put TOKEN_SECRET
```

Placeholder KV IDs in `wrangler.jsonc` are intentional. Deploy-to-Cloudflare / Wrangler can replace them with real resource IDs on first provision.

After deploy:

1. Attach a custom domain or route (see [protecting-origin.md](protecting-origin.md)).
2. Open `https://<your-host>/admin` (or `*.workers.dev/admin` if you have not attached a domain yet).
3. Finish the setup wizard (claim → Cloudflare → Turnstile → queue → branding).
4. Smoke-test `/wait`, `/demo`, and `/cost`.

Later releases: do **not** click Deploy to Cloudflare again. Follow [upgrading.md](upgrading.md) (merge upstream or `git pull`, then redeploy / push to Workers Builds).

## 4. Verify

```bash
npm run ci
curl -s http://localhost:8787/health
curl -s "http://localhost:8787/api/cost-estimate?visitors=100000&averageWaitSeconds=60"
```

## Configuration cheat sheet

| Knob                             | Where                             | Notes                                                         |
| -------------------------------- | --------------------------------- | ------------------------------------------------------------- |
| Capacity / timeouts              | Code defaults (optional env vars) | Override with wrangler vars if needed; redeploy to apply      |
| Admit rate (max outflow)         | `/admin` traffic panel            | Live override; env/code default when cleared                  |
| Default admission mode           | `/admin` wizard or `POST /mode`   | Not a Deploy prompt; optional advanced env override           |
| Origin proxy                     | `/admin` Origin panel             | Stored in KV; not a Deploy prompt                             |
| Branding + depth display         | `/admin` → Save branding          | KV write on save only                                         |
| Admin password                   | `/admin` claim (step 1)           | PBKDF2 hash in KV; emergency reset with `TOKEN_SECRET`        |
| Cloudflare API token / Turnstile | `/admin` setup + Cloudflare panel | Required on first setup; seals token + Turnstile secret in KV |

Full var table: [README configuration](../README.md#configuration)  
API reference: [api.md](api.md)
