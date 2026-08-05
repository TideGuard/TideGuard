# TideGuard Terms of Service

**Version:** 1

These terms apply to anyone who claims, signs in to, or joins the TideGuard **admin control room** on a deployment they operate. They are the operator agreement for **running** TideGuard. The software itself remains licensed under the [MIT License](LICENSE).

This is not a hosted SaaS customer contract. You deploy TideGuard on infrastructure you control (typically your Cloudflare account).

## 1. As-is software

TideGuard is open-source software provided **as is**, without warranty of any kind, express or implied, including but not limited to merchantability, fitness for a particular purpose, and noninfringement. To the maximum extent permitted by law, the authors and copyright holders are not liable for any claim, damages, or other liability arising from the software or your use of it. See [LICENSE](LICENSE).

## 2. Your deployment, your responsibility

You are solely responsible for:

- Your Cloudflare (or other) account, billing, Workers configuration, secrets (including `TOKEN_SECRET`), DNS, SSL, and origin protection
- Who you invite as admins, and what they can change in the control room
- How visitors experience your waiting room, branding, and any data you collect
- Compliance with laws that apply to your events, sites, and visitors (privacy, consumer, accessibility, and so on)

TideGuard’s authors do not operate your waiting room and do not process your visitor traffic as a service provider under these terms.

## 3. Security

Read [SECURITY.md](SECURITY.md). Keep secrets out of git and shared channels. Rotate `TOKEN_SECRET` if it may have leaked. Prefer Turnstile and strong admin passwords; consider Cloudflare Access in front of `/admin` for high-stakes launches.

## 4. Updates to these terms

Terms are versioned in the TideGuard codebase (`TOS_VERSION`). When you upgrade to a release that increments the version, each admin must accept the new terms before using the control room again.

## 5. Feedback and issues

Bugs, security reports, and ideas: [GitHub Issues](https://github.com/TideGuard/TideGuard/issues) and the project [security policy](SECURITY.md).

## 6. Acceptance

By checking the acknowledgment in the admin UI (claim, invite accept, or re-accept after an upgrade), you confirm that you have read these terms for the stated version and agree to them.
