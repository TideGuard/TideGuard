# Admin analytics & traffic

The control room **Live** tab shows live queue metrics and a **server-backed traffic chart** for adaptive max-outflow control. Geo-block hit counts appear with live metrics when a country block is active.

## Traffic series (server)

- QueueRoom Durable Object records joins and admits into ~**15-second** buckets.
- Buckets retain about **2 hours** in DO SQLite (`traffic_buckets`).
- `GET /api/admin/traffic?queue=&rangeMs=` returns the series for Chart.js.
- Chart series:
  - **Total inflow** — joins per bucket
  - **Max outflow** — admit/s setpoint during that bucket (stepped when operators update rate)

Metrics also expose `totalInflow`, `inflowCurrent`, `outflowCurrent`, `admitPerSecond`, and `admitPerSecondOverride`. Event-day controls (rate, pause, force-admit) live in the sticky toolbar.

## Related

- [Admin](admin.md) — traffic panel + rate API
- [API](api.md)
- [Country block](geo-block.md)
