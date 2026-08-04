# Operator webhooks

TideGuard can POST HTTPS callbacks when operators pause admissions, change origin health config, or when waiting depth crosses a threshold. Delivery is **best-effort** (5s timeout, no retries) — use it for paging / Slack bridges, not as a durable audit log (see Activity for that).

## Configure

1. Open `/admin` → **System → Operator webhooks**
2. Enable, paste an `https://` URL, pick events
3. Optionally set a **signing secret** (stored sealed with `TOKEN_SECRET`)
4. For depth events, set the waiting threshold (default 100)

API: `PUT /api/admin/webhooks` (admin session). Settings appear on `GET /api/admin/state` as `webhooks` (secret never returned; `hasSecret` is a boolean).

## Payload

```json
{
  "event": "pause",
  "queue": "default",
  "at": 1710000000000,
  "detail": { "paused": true }
}
```

| Event    | When                                                        | `detail` highlights    |
| -------- | ----------------------------------------------------------- | ---------------------- |
| `pause`  | Silent pause toggled                                        | `paused`               |
| `health` | Origin health throttle config saved                         | `enabled`, `url`       |
| `depth`  | Waiting count reaches threshold (once until it drops below) | `waiting`, `threshold` |

## Signature

If a signing secret is configured, TideGuard sets:

```http
X-TideGuard-Signature: <base64url HMAC-SHA256 of the raw body>
```

Verify with the same secret using a timing-safe compare. See `hmacSign` in `src/auth/crypto.ts`.

## Notes

- Factory reset (`POST /api/admin/reset`) clears webhook settings
- Rotating `TOKEN_SECRET` invalidates the sealed signing secret — re-save it
- Do not point webhooks at TideGuard itself on the hot path

## Related

- [Admin](admin.md)
- [API](api.md)
- [TOKEN_SECRET rotation](token-secret-rotation.md)
