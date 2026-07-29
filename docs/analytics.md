# Admin analytics

The control room **Analytics** panel charts queue and geo-block activity from the live metrics already shown in the dashboard.

## How it works

- While the control room is open, metrics polls (~5s) upsert one **5-minute** bucket in this browser’s `localStorage`.
- No Durable Object / KV time-series is stored server-side.
- History is kept for up to **24 hours** in the browser and pruned automatically.
- Range toggle: **1h**, **12h**, or **24h** (filters the same local series).

Charts:

| Chart | Series |
| --- | --- |
| Queue depth | Waiting, admitted |
| Average wait | `averageWaitSeconds` |
| Country block hits | Per-interval delta of `geoBlock.stats.totalHits` |
| Blocked countries | Live `byCountry` for the current block window |

Leaving the control room closed for a stretch means those intervals are missing from the chart until you open it again.

## Related

- [Admin](admin.md)
- [Country block](geo-block.md)
- [API](api.md)
