# Country block (temporary geo gate)

Block visitors by Cloudflare’s **`CF-IPCountry`** header for a limited time (TTL). Intended for event windows — not as a permanent security control (use [WAF](https://developers.cloudflare.com/waf/) for that).

## Requirements

1. Zone **IP Geolocation** on (Admin → Cloudflare access → Check/Fix setup).
2. Traffic **proxied** (orange cloud) so Cloudflare attaches geo headers.

## Behaviour

| Request                         | Result                                      |
| ------------------------------- | ------------------------------------------- |
| Country on active block list    | `403` branded “Not available in your region” |
| IP allowlisted                  | Not geo-blocked (office override)           |
| Admin **Pass queue**            | Not geo-blocked                             |
| Valid admission cookie          | Allowed through                             |
| List **expired** (TTL)          | Block inactive — everyone queues normally   |
| Unknown `XX` / `T1`             | Not blocked unless those codes are listed   |

Checked on protected origin paths, `/wait`, `/demo`, and `POST /join` — before the waiting room / Durable Object.

## Admin setup

1. `/admin` → **Country block**
2. Enter ISO codes (one per line), e.g. `CN`, `RU`
3. Set **TTL (hours)** (required when enabling; max 30 days)
4. Enable + **Save country block** (resets the hit counter window)
5. Status shows your `CF-IPCountry` and whether you would be blocked
6. **Live queue** shows **Geo blocks** total + per-country hits (refreshes every 5s)
7. **Disable now** clears the active gate (keeps the code list in the form)

Hit stats live in KV (`admin:geo-block-stats`) separately from the block list so saves keep history until you enable a new window. Totals feed the admin Analytics charts in the browser (see [analytics.md](analytics.md)).

## Clients (full page, widget, API)

| Surface | Behaviour when blocked |
| --- | --- |
| Full page `/wait` | `403` HTML “Not available in your region” |
| Widget `/wait?embed=1` | Same HTML, embed-sized layout |
| Waiting-room JS (if `/join` 403) | Stops polling; shows region error in-page |
| Custom API `POST /join` | `403` JSON `{ error: { code: "forbidden", details: { country } } }` |

Marketing demos at tideguard.dev include a **Simulate geo block** control on full / widget / API pages.

## API

`PUT /api/admin/geo-block`

```json
{
  "enabled": true,
  "countriesText": "CN\nRU",
  "ttlHours": 24
}
```

Stored in KV (`admin:geo-block`) as `{ enabled, countries, expiresAt, updatedAt }`.

## Related

- [IP allowlist](ip-allowlist.md)
- [Protecting a domain or origin](protecting-origin.md)
- [Admin](admin.md)
