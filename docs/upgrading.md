# Upgrading TideGuard

How to pull a newer TideGuard release into an existing Cloudflare deployment without recreating the Worker, losing KV config, or rotating secrets by accident.

First-time install: [getting-started.md](getting-started.md). Pre-launch checks: [launch-checklist.md](launch-checklist.md).

## What survives a normal upgrade

| Asset                      | Survives redeploy? | Notes                                                                |
| -------------------------- | ------------------ | -------------------------------------------------------------------- |
| Worker code                | Replaced           | That is the point of upgrading                                       |
| `TOKEN_SECRET`             | Yes                | Wrangler secret; do not re-prompt unless you intend to rotate        |
| KV (`CONFIG_KV`) data      | Yes                | Admin password hash, branding, origin, allowlist, geo-block          |
| Durable Object queue state | Yes                | Same class + migration tags; visitors stay in line across redeploys  |
| Custom domains / routes    | Yes                | Dashboard / Workers Builds settings                                  |
| `wrangler.jsonc` `vars`    | Replaced by deploy | Capacity / timeouts come from the file you deploy; origin/queue/mode live in `/admin` KV |
| Admin overrides in KV      | Yes                | Origin / branding / Cloudflare credentials saved in `/admin`                             |

Re-clicking **Deploy to Cloudflare** on the README is a **new** install (new fork / new resources). It is not an upgrade.

## Before you upgrade

1. Read `[Unreleased]` / the target version in [CHANGELOG.md](../CHANGELOG.md), especially any **Upgrade notes**.
2. Note your current version: `GET /health` → `version` (see `src/version.ts`).
3. Prefer a quiet window if the CHANGELOG mentions Durable Object or token-format changes.
4. Keep a copy of your production `wrangler.jsonc` (especially real KV namespace IDs) before merging git.

## Path A — Deploy-to-Cloudflare / Workers Builds (fork)

The button clones TideGuard into **your** GitHub/GitLab repo and wires builds. Later updates are git + push, not the badge.

```bash
# once
git remote add upstream https://github.com/TideGuard/TideGuard.git

git fetch upstream
git checkout main   # or your production branch
git merge upstream/main
```

Resolve conflicts carefully:

1. **`wrangler.jsonc`** — keep **your** `kv_namespaces[].id` / `preview_id` values (the real IDs Cloudflare wrote on first provision). Take upstream changes for everything else (`vars`, `migrations`, bindings, compatibility date).
2. **Do not** commit placeholder IDs (`0000…`) over a live namespace — that can point the Worker at a new empty KV and look like a “wiped” admin.
3. **`TOKEN_SECRET`** — leave the existing Worker secret alone unless you are rotating on purpose.

Then:

```bash
npm install
npm run ci          # optional but recommended on the merge commit
git push origin main
```

Workers Builds deploys from that push. If you deploy from CI/CLI instead of Builds: `npm run deploy`.

Confirm: `GET https://<your-host>/health` shows the new `version`, `/admin` still logs in, queue metrics still look sane.

## Path B — CLI clone (same repo you deploy from)

```bash
git pull            # or merge a release tag
npm install
npm run deploy
```

`TOKEN_SECRET` and bindings stay with the Worker name in `wrangler.jsonc` (`tideguard` by default). Only run `wrangler secret put TOKEN_SECRET` when rotating.

If this checkout never had real KV IDs committed (placeholders only), Wrangler already bound the live namespace on first deploy — do not replace that binding in the dashboard with a fresh namespace unless you intend to reset config.

## Path C — Track a release tag

```bash
git fetch upstream --tags
git merge vX.Y.Z    # or: git checkout vX.Y.Z && npm run deploy from a release checkout
```

Prefer tagged releases once they exist. Until then, `upstream/main` plus the CHANGELOG is the source of truth.

## Check from admin

After login, the control room **Updates** panel compares the running `VERSION` (`src/version.ts`, also on `GET /health`) to GitHub’s [`releases/latest`](https://api.github.com/repos/TideGuard/TideGuard/releases/latest) API.

- Results are cached in KV for about 6 hours (`admin:update-check`).
- **Check for updates** forces a fresh lookup (`GET /api/admin/updates?refresh=1`).
- A published GitHub Release (e.g. `v0.1.0`) is required; until one exists, the panel reports that no releases are published yet.
- Seeing an update does **not** auto-deploy — follow Path A or B above (and any CHANGELOG **Upgrade notes**).

## What the project migrates for you

| Layer                        | Mechanism                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------- |
| Durable Object SQL           | `QueueRoom.migrate()` + `schema_version` in DO storage                        |
| Durable Object class binding | Append-only `migrations` entries in `wrangler.jsonc` (never rewrite old tags) |
| Admin / branding KV          | Soft merges + defaults for new fields; additive changes should not wipe UI    |

Breaking changes (renamed bindings, removed KV keys, token format, DO class rename/delete) will be called out under **Upgrade notes** in the CHANGELOG with exact operator steps.

## Post-upgrade checklist

- [ ] `/health` returns 200 and the expected `version`
- [ ] `/admin` login still works (same password); wizard does **not** reappear
- [ ] If this release adds **required Turnstile** for login: complete Cloudflare + Turnstile in `/admin` (or emergency `POST /api/admin/reset` + re-run wizard on a non-prod Worker first)
- [ ] Live queue / metrics respond for your default queue
- [ ] If you use origin proxy: unauthenticated path → `/wait`; admitted → origin
- [ ] If CHANGELOG lists new `vars`, decide whether to adopt upstream defaults or keep your tuned values, then redeploy
- [ ] Smoke-test `/wait` join → admit once before a real launch

## Upgrade notes (Unreleased → Cloudflare + Turnstile setup)

Existing deploys that already finished the old 3-step wizard keep working for **session cookies already issued**. New logins and invite accepts expect Turnstile once `admin:turnstile` is configured. Fresh Workers (or after `POST /api/admin/reset`) must complete the **5-step** wizard: Account → Cloudflare verify → Turnstile → Queue → Branding.

Token permissions for the in-admin Cloudflare flow: Zone DNS Edit, Zone Read, Zone Settings Edit, Account Turnstile Edit, Workers Scripts Write. See [admin.md](admin.md) and [ip-allowlist.md](ip-allowlist.md).

## Rollback

1. Redeploy the previous known-good git revision (`git checkout <sha>` → `npm run deploy`, or revert the commit on the Builds branch and push).
2. Do **not** delete the KV namespace or Durable Object class to “roll back.”
3. Only rotate `TOKEN_SECRET` if you believe it leaked — rotation invalidates admission tokens and admin sessions.

## Related

- [Getting started](getting-started.md)
- [Launch checklist](launch-checklist.md)
- [Architecture](architecture.md)
- [CHANGELOG](../CHANGELOG.md)
- [SECURITY.md](../SECURITY.md)
