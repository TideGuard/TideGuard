# IP allowlist (queue bypass)

Staff on a fixed office network can skip the waiting room. TideGuard matches the visitor’s IP against an allowlist and mints a normal admission cookie — **without** joining the Durable Object queue or consuming a concurrent slot.

## How IP detection works

Cloudflare sets **`CF-Connecting-IP`** on every request that is **proxied** (orange cloud) to your Worker. There is **no separate zone setting** to “turn on” this header.

| Situation                       | Result                                      |
| ------------------------------- | ------------------------------------------- |
| Hostname proxied + Worker route | `CF-Connecting-IP` present; allowlist works |
| DNS-only (grey cloud)           | Header missing; allowlist cannot match      |
| Trusting `X-Forwarded-For`      | **Not used** for bypass (spoofable)         |

In **Admin → IP allowlist**, TideGuard shows your current connecting IP and whether it matches the list.

## Configure the allowlist

1. Open `/admin` → **IP allowlist**.
2. Add IPs or CIDRs (one per line), e.g. `203.0.113.0/24`.
3. **Save allowlist**.
4. Confirm the status line shows your IP and “matches allowlist” when you’re on that network.

Allowlisted clients:

- Pass protected origin paths without `/wait`
- Are redirected straight from `/wait` to the return URL
- Can open `/demo` without queuing

## Cloudflare API (optional automation)

Paste a **Zone ID** + scoped **API token** so TideGuard can check (and fix) zone setup via the Cloudflare API.

> **Not the same setting:** Dashboard **IP Geolocation** turns on `CF-IPCountry` (visitor country).  
> IP allowlisting uses **`CF-Connecting-IP`**, which appears when the hostname is **proxied** (orange cloud). TideGuard can check/enable both.

### Create the token

1. [API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token** → **Create Custom Token**
2. Permissions:
   - `Zone` → `DNS` → **Edit**
   - `Zone` → `Zone` → **Read**
   - `Zone` → `Zone Settings` → **Edit**
3. Zone Resources → **Include** → only the zone that fronts TideGuard
4. Create the token, copy it once

### In TideGuard admin → Cloudflare access

1. **Zone ID** — 32-char id on the zone Overview page (same id as in  
   `https://api.cloudflare.com/client/v4/zones/<zone_id>/settings/ip_geolocation`)
2. **API token** → **Save Cloudflare access** (encrypted with `TOKEN_SECRET`; never shown again)
3. **Hostname** — e.g. `www.example.com`
4. **Check setup** — DNS proxied? IP Geolocation on?
5. **Fix setup** — sets grey-cloud records to proxied; turns IP Geolocation on if off

Also confirm the hostname is attached to the TideGuard Worker (**Custom domains** or **Routes**).

Relevant APIs:

```http
GET  /zones/{zone_id}/dns_records?name={hostname}
PATCH /zones/{zone_id}/dns_records/{id}          # { "proxied": true }
GET  /zones/{zone_id}/settings/ip_geolocation
PATCH /zones/{zone_id}/settings/ip_geolocation   # { "value": "on" }
```

## Security notes

- Prefer narrow CIDRs (office egress), not `0.0.0.0/0`
- Office NAT shares one public IP — everyone on that LAN bypasses
- Staff off-network (home/mobile) will still queue unless you add more ranges or use another bypass (e.g. Cloudflare Access)
- Clearing admin via reset also clears allowlist + API token

## Pass queue (admin)

From **IP allowlist → Pass queue (this browser)**:

1. Issues a normal `tg_access` admission cookie for the signed-in admin
2. Redirects to the branding redirect path (or `/` / `/demo`)
3. Does **not** join the Durable Object or consume capacity

Use this to smoke-test the protected app during an event without standing in line.

## Related

- [Protecting a domain or origin](protecting-origin.md)
- [Admin](admin.md)
- [Architecture](architecture.md)
