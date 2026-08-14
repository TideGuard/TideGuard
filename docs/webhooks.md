# Operator webhooks

TideGuard can POST HTTPS callbacks for operator and queue transitions. It tries once with a 5s timeout. Failed or non-2xx deliveries are stored in the queue's Durable Object and retried up to eight times with exponential backoff. Activity remains the authoritative operator audit log.

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

| Event                | When                                                        | `detail` highlights       |
| -------------------- | ----------------------------------------------------------- | ------------------------- |
| `pause`              | Silent pause toggled                                        | `paused`                  |
| `health`             | Origin health throttle config saved                         | `enabled`, `url`          |
| `depth`              | Waiting count reaches threshold (once until it drops below) | `waiting`, `threshold`    |
| `opened`             | A future opening schedule is cleared or becomes open        | `opensAt`                 |
| `origin_unhealthy`   | Origin health first enters auto-pause                       | health level/status/error |
| `queue_full`         | A join is rejected at the waiting cap                       | `rejected`                |
| `admit_rate_changed` | An operator changes max outflow                             | rate and override         |

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
- Retry rows contain the prepared URL, headers, signature, and body; retries never read KV

## Related

- [Admin](admin.md)
- [API](api.md)
- [TOKEN_SECRET rotation](token-secret-rotation.md)
