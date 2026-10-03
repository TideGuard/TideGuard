# Operator webhooks

TideGuard can POST HTTPS callbacks for pause, health config, waiting depth, schedule open, origin health, and queue capacity. It tries once with a 5s timeout. Failed or non-2xx deliveries are stored in the queue's Durable Object and retried up to eight times with exponential backoff. Activity remains the authoritative operator audit log.

## Configure

1. Open [`/admin#webhooks`](/admin#webhooks) (System → Operator webhooks)
2. Enable, paste an `https://` URL, pick events
3. Optionally set a **signing secret** (stored sealed with `TOKEN_SECRET`, or `ADMIN_SECRET` when set)
4. For depth events, set the waiting threshold (default 100)
5. Use **Send test** to verify the URL; check **Last delivery** for status/time

API: `PUT /api/admin/webhooks` (admin session). Test: `POST /api/admin/webhooks/test`. Settings appear on `GET /api/admin/state` as `webhooks` (secret never returned; `hasSecret` is a boolean; `lastDelivery` is optional).

## Payload

```json
{
  "event": "pause",
  "queue": "default",
  "at": 1710000000000,
  "detail": { "paused": true }
}
```

| Event                | When                                                         | `detail` highlights       |
| -------------------- | ------------------------------------------------------------ | ------------------------- |
| `pause`              | Silent pause toggled                                         | `paused`                  |
| `health`             | Origin health throttle config saved                          | `enabled`, `url`          |
| `depth`              | Waiting count reaches threshold (once until it drops below)  | `waiting`, `threshold`    |
| `depth_cleared`      | Waiting drops below threshold after a depth fire             | `waiting`, `threshold`    |
| `opened`             | A future opening schedule is cleared or becomes open         | `opensAt`                 |
| `schedule_open`      | Room leaves waiting-for-`opensAt` (time reached or Open now) | `opensAt`, `openedAt`     |
| `origin_unhealthy`   | Origin health first enters auto-pause                        | health level/status/error |
| `queue_full`         | Join rejected at waiting cap (debounced ≤1/min)              | `at`                      |
| `admit_rate_changed` | An operator changes max outflow                              | rate and override         |
| `test`               | Manual Send test from admin (not a subscription checkbox)    | `ok`, `source`            |

## Signature

If a signing secret is configured, TideGuard sets:

```http
X-TideGuard-Signature: <base64url HMAC-SHA256 of the raw body>
```

Verify with the same secret using a timing-safe compare. See `hmacSign` in `src/auth/crypto.ts`. If a signing secret is stored but cannot be decrypted, TideGuard **skips delivery** and records the error on `lastDelivery` (never sends an unsigned body while `hasSecret` is true).

## Notes

- Webhook URLs must be public `https://` endpoints (same private/metadata host blocklist as origin URLs)
- `queue_full` is debounced (about once per minute) so join spam cannot amplify outbound POSTs
- Factory reset (`POST /api/admin/reset`) clears webhook settings
- Introducing `ADMIN_SECRET` re-seals the signing secret on next open; if decrypt still fails, re-save it under System → Webhooks
- Do not point webhooks at TideGuard itself on the hot path
- Retry rows contain the prepared URL, headers, signature, and body; retries never read KV

## Related

- [Admin](admin.md)
- [API](api.md)
- [TOKEN_SECRET rotation](token-secret-rotation.md)
