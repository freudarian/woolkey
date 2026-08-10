# woolkey

Woolkey secure password generator by CoolerSheep.

---

# Agent API

WoolKey can be driven by scripts, automation, and AI agents through two transports.
Both produce identical output for identical input — same entropy figures, same
metadata, same validation rules.

| | Transport | Use when |
|---|---|---|
| **HTTP** | `POST /api/generate` | The agent speaks HTTP (Postman, curl, tool-calling agents, CI) |
| **In-page** | `window.WoolKeyAPI` | The agent drives a real browser session |

Both are **stateless**. Nothing generated is stored, logged, or retained on the
server. WoolKey does not save credentials — pass the returned value straight to
your password manager.

> The two transports are deliberately separate. The page's Content Security Policy
> sets `connect-src 'none'`, so in-page JavaScript cannot make network requests at
> all — a generated credential can never leave the browser. The in-page API
> therefore generates locally rather than calling the HTTP endpoint.

---

## HTTP endpoint

Base URL: `https://coolersheep.com/woolkey/api`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | none | Liveness probe |
| `GET` | `/generate` | none | Capability descriptor — modes, options, limits, defaults |
| `GET` | `/openapi.json` | none | OpenAPI 3.1 specification |
| `POST` | `/generate` | API key | Generate credentials |
| `OPTIONS` | `/generate` | none | CORS preflight |

An agent that has never seen this README can discover the whole contract from
`GET /generate` or `/openapi.json`.

### Authentication

Send the token in either header:

```
X-Api-Key: <token>
Authorization: Bearer <token>
```

`POST` refuses to run until `api/config.php` exists with an `api_token` set — a
missing or empty token returns **503**, not open access. See
[Server setup](#server-setup).

### Request

`Content-Type: application/json`

| Field | Type | Default | Notes |
|---|---|---|---|
| `mode` | string | *required* | `"password"` or `"passphrase"` |
| `count` | integer | `1` | 1–20. Returns a batch in `results`. |
| `entropyMode` | string | `"system"` | Only `"system"` server-side |
| `options` | object | `{}` | Mode-specific, below |

**`options` for `mode: "password"`**

| Field | Type | Default | Range |
|---|---|---|---|
| `length` | integer | `24` | 8–128 |
| `includeLowercase` | boolean | `true` | |
| `includeUppercase` | boolean | `true` | |
| `includeNumbers` | boolean | `true` | |
| `includeSymbols` | boolean | `false` | Set: `` !@#$%^&*()-_=+[]{};:,.? `` |
| `avoidAmbiguous` | boolean | `false` | Excludes `0O1Il5S8B` |
| `excludedCharacters` | string | `""` | Max 128 chars |

**`options` for `mode: "passphrase"`**

| Field | Type | Default | Range |
|---|---|---|---|
| `wordCount` | integer | `4` | 4–8 |
| `separator` | string | `"hyphen"` | `hyphen`, `underscore`, `dot`, `space` |
| `capitalize` | boolean | `false` | |
| `addNumber` | boolean | `false` | Two-digit suffix; **not** counted toward entropy |

Out-of-range values are **rejected with 400**, never silently clamped. Asking for
`length: 200` returns an error rather than a 24-character password you would
otherwise assume was 200.

### Response

```json
{
  "mode": "password",
  "count": 1,
  "value": "qozqwz#2XTW!L^,L@pKJRi*F",
  "entropy": { "bits": 149.95, "label": "Excellent", "level": 4 },
  "metadata": { "entropyMode": "system", "poolSize": 76, "length": 24 },
  "results": [
    {
      "value": "qozqwz#2XTW!L^,L@pKJRi*F",
      "entropy": { "bits": 149.95, "label": "Excellent", "level": 4 },
      "metadata": { "entropyMode": "system", "poolSize": 76, "length": 24 }
    }
  ]
}
```

Top-level `value` / `entropy` / `metadata` always mirror `results[0]`, so
single-result callers can ignore `results` entirely.

`entropy.label` is one of `Weak` (<40 bits), `Fair` (<60), `Strong` (<80),
`Very strong` (<100), `Excellent` (100+), with `level` 0–4 to match.

### Errors

```json
{ "error": "options.length must be between 8 and 128", "status": 400, "field": "options.length" }
```

`field` names the request field to correct, when one applies.

| Status | Meaning |
|---|---|
| `400` | Invalid input — see `error` and `field` |
| `401` | Missing or incorrect API key |
| `405` | Wrong method — see the `Allow` header |
| `413` | Body larger than 16 KB |
| `429` | Rate limited — see `Retry-After` |
| `503` | `api/config.php` missing or has no token |

### Rate limiting

20 requests per IP per 60 seconds by default. Every response carries
`X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`; a 429 adds
`Retry-After`. All are exposed to browsers via `Access-Control-Expose-Headers`.

### Examples

Password:

```bash
curl -X POST https://coolersheep.com/woolkey/api/generate -H "Content-Type: application/json" -H "X-Api-Key: $WOOLKEY_TOKEN" -d '{"mode":"password","options":{"length":32,"includeSymbols":true,"avoidAmbiguous":true}}'
```

Passphrase:

```bash
curl -X POST https://coolersheep.com/woolkey/api/generate -H "Content-Type: application/json" -H "X-Api-Key: $WOOLKEY_TOKEN" -d '{"mode":"passphrase","options":{"wordCount":6,"capitalize":true}}'
```

Batch of five:

```bash
curl -X POST https://coolersheep.com/woolkey/api/generate -H "Content-Type: application/json" -H "X-Api-Key: $WOOLKEY_TOKEN" -d '{"mode":"password","count":5,"options":{"length":24}}'
```

Discover the contract:

```bash
curl https://coolersheep.com/woolkey/api/generate
```

### Postman

1. Method `POST`, URL `https://coolersheep.com/woolkey/api/generate`.
2. Headers: `Content-Type: application/json` and `X-Api-Key: <your-token>`.
3. Body → raw → JSON, paste one of the bodies above.

Or import `https://coolersheep.com/woolkey/api/openapi.json` (**Import → Link**) to
get every request pre-built.

### Wiring it into an agent

The endpoint maps onto one tool definition. Give the agent the `POST /generate`
schema from `openapi.json` and it needs nothing else — it can call `GET /generate`
at runtime to confirm limits and defaults.

Keep the token in an environment variable rather than the tool definition, and
treat the returned `value` as a secret: do not log it, echo it into a transcript,
or write it to a scratch file.

---

## In-page API

Loaded by `index.html` as `js/agent-api.js`. `window.WoolKeyAPI` exposes:

| Member | Purpose |
|---|---|
| `version` | API version string |
| `ready` | `true` once the API is attached |
| `describe()` | Capability descriptor, mirroring `GET /api/generate` |
| `generate(input)` | Returns `{ ok: true, data }` or `{ ok: false, error, field? }` |
| `generateCredential(input)` | Same, but throws on invalid input |

`generate()` is preferred for automation — an exception thrown inside a
`page.evaluate()` call is awkward to inspect, whereas a returned object is not.

Wait for readiness with the `woolkey:ready` event rather than polling:

```js
if (!window.WoolKeyAPI?.ready) {
  await new Promise((resolve) => window.addEventListener('woolkey:ready', resolve, { once: true }));
}

const result = window.WoolKeyAPI.generate({
  mode: 'password',
  count: 3,
  options: { length: 24, includeSymbols: true, avoidAmbiguous: true },
});

if (!result.ok) throw new Error(result.error);
// result.data.results[].value — use directly, do not log.
```

`input` takes the same fields as the HTTP endpoint, with one addition:
`entropyMode: 'system+user'` mixes pointer and keyboard timing into the CSPRNG
output as defence in depth. Check `metadata.userEntropySamples` — it is `0` until
input has actually been observed, so an agent that calls this immediately on load
gains nothing from it. The HTTP endpoint rejects `system+user` with a 400 rather
than accepting it and quietly generating with system entropy only.

---

## Server setup

Deployed on cPanel (Apache, PHP 8.3) at `~/public_html/woolkey/`.

1. Upload the repository contents, including `api/`.
2. Create the config:

   ```bash
   cd ~/public_html/woolkey/api && cp config.example.php config.php && chmod 600 config.php
   ```

3. Generate a token and put it in `config.php`:

   ```bash
   php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
   ```

   ```php
   return ['api_token' => 'your-token-here'];
   ```

4. Verify:

   ```bash
   curl https://coolersheep.com/woolkey/api/health
   ```

`config.php` is blocked from the web by `api/.htaccess` (and by the root
`.htaccess`), and is gitignored so the live token is never committed. To rotate,
replace the value and update your clients — there is no session state to
invalidate.

`api/config.example.php` documents every option: `allow_unauthenticated`,
`allowed_origins`, `rate_limit`, `max_count`, and `max_body_bytes`.
