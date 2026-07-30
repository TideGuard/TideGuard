# Admin analytics & traffic

The control room shows live queue metrics and a **server-backed traffic chart** for adaptive max-outflow control.

## Traffic series (server)

- QueueRoom Durable Object records joins and admits into ~**15-second** buckets.
- Buckets retain about **2 hours** in DO SQLite (`traffic_buckets`).
- `GET /api/admin/traffic?queue=&rangeMs=` returns the series for Chart.js.
- Chart series:
  - **Total inflow** — joins per bucket
  - **Max outflow** — admit/s setpoint during that bucket (stepped when operators update rate)

Metrics also expose `totalInflow`, `inflowCurrent`, `outflowCurrent`, `admitPerSecond`, and `admitPerSecondOverride`.

## Related

- [Admin](admin.md) — traffic panel + rate API
- [API](api.md)
- [Country block](geo-block.md)
