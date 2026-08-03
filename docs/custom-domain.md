# Custom domain

Point a real hostname (for example `shop.example.com` or `example.com`) at the TideGuard Worker so visitors hit the waiting room instead of your origin directly.

TideGuard needs an **active Cloudflare zone** for that hostname, then a **Workers custom domain** (or route) on the Worker. How you get the zone depends on whether you can move DNS to Cloudflare.

## Choose a zone setup

| Path | What you do | Cloudflare plan | When to use |
| ---- | ----------- | --------------- | ----------- |
| **Full setup (nameservers)** | Point the domain’s NS records at Cloudflare | Free, Pro, Business, or Enterprise | Default. Simplest and cheapest. |
| **Partial setup (CNAME)** | Keep your current DNS provider; CNAME individual hostnames into Cloudflare | **Business or Enterprise only** | You cannot (or must not) change authoritative nameservers. |

Cloudflare’s overview: [DNS setups](https://developers.cloudflare.com/dns/zone-setups/).

After the zone is active and the hostname is proxied (orange cloud), attach TideGuard — see [Attach the Worker](#attach-the-worker) below. Origin proxy, SSL Full (strict), and Authenticated Origin Pulls are covered in [protecting-origin.md](protecting-origin.md).

---

## Option A — Full setup (move nameservers)

Recommended for almost every TideGuard deploy. Available on Free and Pro.

1. Create a Cloudflare account and [onboard the apex domain](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/) (for example `example.com`).
2. Review the imported DNS records. Keep mail and other critical records intact.
3. At your **registrar**, replace the authoritative nameservers with the two Cloudflare nameservers shown on the zone **Overview** / **DNS** page. Copy them exactly.
4. Wait until the zone status is **Active** (often minutes; can take up to 24 hours). Confirm with:

   ```bash
   dig ns example.com @1.1.1.1
   ```

5. If you use DNSSEC, follow Cloudflare’s [DNSSEC](https://developers.cloudflare.com/dns/dnssec/) guidance (disable at the old provider / remove DS before the cutover if needed, then re-enable on Cloudflare).

Official walkthrough: [Set up a primary zone (full setup)](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/).

Then continue with [Attach the Worker](#attach-the-worker).

---

## Option B — Partial setup (CNAME / Business plan)

Use this only when you **must keep** another company as the authoritative DNS provider and still want Cloudflare (and TideGuard) in front of selected hostnames.

**Requirements**

- Zone on a **Business or Enterprise** plan (partial / CNAME setup is not available on Free or Pro). See [Cloudflare plans](https://www.cloudflare.com/plans/).
- You will proxy **individual hostnames** (typically subdomains). Apex/`CNAME`-flattening rules still follow Cloudflare’s partial-setup docs.

**High-level steps** (follow Cloudflare’s guide for the exact clicks):

1. Add the domain to Cloudflare and choose **Business** or **Enterprise**.
2. Convert the zone to a **CNAME DNS setup** (partial), or create it as `type: partial` via the API.
3. Publish Cloudflare’s **verification TXT** at your current DNS provider and wait for ownership verification.
4. For each hostname TideGuard should serve (for example `shop.example.com`):
   - At your **authoritative** DNS provider, add a CNAME to `{hostname}.cdn.cloudflare.net` and remove conflicting A/AAAA/CNAME records for that name.
   - **Do not** pre-create a conflicting CNAME for that hostname inside the Cloudflare zone if you plan to use Workers **Custom Domain** — Custom Domain attach creates/owns the in-zone DNS record. Prefill only what Cloudflare’s partial-setup docs require; if an in-zone CNAME already points elsewhere, delete it before attach (see below).

Official walkthrough: [Set up a partial zone (CNAME setup)](https://developers.cloudflare.com/dns/zone-setups/partial-setup/setup/)  
Overview: [Partial (CNAME) setup](https://developers.cloudflare.com/dns/zone-setups/partial-setup/)

Then continue with [Attach the Worker](#attach-the-worker).

---

## Attach the Worker

Once ownership is verified (and, for full setup, the zone is **Active**):

Cloudflare will not create a Workers **Custom Domain** on a hostname that already has a conflicting CNAME in the Cloudflare zone. Safe order:

1. Authoritative DNS (partial only): CNAME → `{hostname}.cdn.cloudflare.net`.
2. Cloudflare zone: no leftover CNAME/A/AAAA for that hostname that would block Custom Domain — delete conflicts first, or let Custom Domain create the record.
3. Attach the Worker (admin or dashboard).
4. Confirm the hostname is **proxied** (orange cloud).
5. If **Attach custom domain** fails with a DNS conflict, use a Worker **Route** instead: pattern `your-hostname/*` on the already-proxied hostname ([Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)).

### From TideGuard admin (recommended)

1. Finish `/admin` setup and open **Cloudflare access**.
2. Confirm zone ID + hostname (wizard or control room).
3. Use **Attach custom domain** (or complete the wizard’s domain step) so the Worker receives that hostname.
4. Enable **Origin proxy** toward your real upstream ([protecting-origin.md](protecting-origin.md)).
5. Open `https://your-hostname/admin` and `/wait` to smoke-test.

### From the Cloudflare dashboard

1. **Workers & Pages** → your TideGuard Worker → **Settings** → **Domains & Routes**.
2. **Add** → **Custom Domain** → enter the hostname (or **Add** → **Route** with `hostname/*` if Custom Domain is blocked).
3. For Custom Domain, Cloudflare creates/updates the DNS record for that hostname when the zone allows it.

Docs: [Workers custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) · [Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)

Custom Domains require a zone you control on Cloudflare. You cannot attach a hostname on a zone you do not own.

---

## Checklist

- [ ] Zone **Active** (full NS) or ownership verified (partial)
- [ ] Hostname **proxied** (orange cloud)
- [ ] TideGuard Worker **custom domain** or **route** attached
- [ ] `/admin` reachable on that hostname; origin proxy + SSL Full (strict) for production ([protecting-origin.md](protecting-origin.md))
- [ ] Launch checks: [launch-checklist.md](launch-checklist.md)

## Related

- [Getting started](getting-started.md) — first deploy and claim
- [Protecting a domain or origin](protecting-origin.md) — proxy, AOP, bot/WAF notes
- [Admin](admin.md) — Cloudflare step in the setup wizard
