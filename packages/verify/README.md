# @tideguard/verify

Verify TideGuard HMAC admission tokens in a trusted server environment.

Use **`ADMISSION_SECRET`** (or `TOKEN_SECRET` on older deploys that have not split secrets yet). Do **not** give your origin the powerful `TOKEN_SECRET` operator secret.

```js
import { verifyAccessToken } from "@tideguard/verify";

const claims = await verifyAccessToken(token, process.env.ADMISSION_SECRET, {
  expectedQueue: "default",
});
```

Never expose `ADMISSION_SECRET`, `TOKEN_SECRET`, or this signing API to browser code. The Worker
implementation in `src/auth` remains TideGuard's source of truth; this package is its npm-ready extract.
