# Before you deploy

Short visual roadmap for operators: **deploy → setup wizard → go live**.

## Visual guide

Open the one-page roadmap (same design as the cost calculator):

| Where                | URL                                                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **On tideguard.dev** | [tideguard.dev/before-you-deploy](https://tideguard.dev/before-you-deploy) _(when the site nav is updated)_                                                     |
| **On your Worker**   | `https://<your-host>/before-you-deploy`                                                                                                                         |
| **Download HTML**    | `https://<your-host>/before-you-deploy/download` — or [assets/before-you-deploy.html](../assets/before-you-deploy.html) from this repo (offline / print to PDF) |

Site navigation (Docs · **Before you deploy** · Deploy) lives in the [TideGuard-Website](https://github.com/TideGuard/TideGuard-Website) repo — not this Worker.

## The eight steps (summary)

| #   | Step                    | Where                                              |
| --- | ----------------------- | -------------------------------------------------- |
| 1   | Generate `TOKEN_SECRET` | [tideguard.dev/token](https://tideguard.dev/token) |
| 2   | Deploy to Cloudflare    | [Deploy button](../README.md) — one secret prompt  |
| 3   | Claim `/admin`          | Password + save recovery phrase                    |
| 4   | Connect Cloudflare      | Wizard: token → zone → SSL → domain                |
| 5   | Turnstile + queue       | Wizard: admin login + waiting room                 |
| 6   | Demo mode               | Smoke-test `/demo` — origin not gated yet          |
| 7   | Go live                 | Origin URL + protect paths                         |
| 8   | Launch checklist        | [launch-checklist.md](launch-checklist.md)         |

Details: [getting-started.md](getting-started.md) · [admin.md](admin.md) · [protecting-origin.md](protecting-origin.md).
