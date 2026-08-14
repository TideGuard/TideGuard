# Waiting-room rules

Open `/admin` → **System → Room rules** to configure inexpensive request rules stored in KV.

- **SEO crawler bypass** lets common crawler user agents such as Googlebot and Bingbot pass the protected access gate without a queue token.
- **Cookie bypass** passes requests containing the configured cookie name. Only the name is checked.
- **Header bypass** passes requests whose configured header exactly matches its value.
- **JSON mode** returns `{ "redirect": "/wait?..." }` instead of a 302 when a protected request advertises `Accept: application/json`. Custom UIs should use `/join` and `/status`.
- **Reject when full** returns a branded 503 from `/wait` when the queue has reached its waiting cap, without attempting another join.

Crawler, cookie, and header rules are evaluated before contacting the queue Durable Object. Treat bypass cookie/header values as access-control configuration: set them only at a trusted proxy or origin boundary, and do not expose them in browser code.

API: `PUT /api/admin/room-rules` with an admin session. Current settings are returned as `roomRules` by `GET /api/admin/state`.
