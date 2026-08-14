# @tideguard/verify

Verify TideGuard HMAC admission tokens in a trusted server environment.

```js
import { verifyAccessToken } from "@tideguard/verify";

const claims = await verifyAccessToken(token, process.env.TOKEN_SECRET, {
  expectedQueue: "default",
});
```

Never expose `TOKEN_SECRET` or this signing API to browser code. The Worker implementation in
`src/auth` remains TideGuard's source of truth; this package is its npm-ready extract.
