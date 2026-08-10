# woolkey
Woolkey secure password generator by CoolerSheep

## Agent API

WoolKey exposes a small browser API so automation, scripts, and AI agents can generate
credentials without clicking the UI.

`window.WoolKeyAPI.generateCredential(input)`

How it works:

1. The page loads the generator scripts in the browser.
2. Your code calls `window.WoolKeyAPI.generateCredential(...)`.
3. WoolKey validates the request, generates a password or passphrase locally, and returns a
   structured result.
4. Nothing is sent to a server unless your own code sends it somewhere.

Input shape:

- `mode`: `"password"` or `"passphrase"` (required)
- `options`: generator options for the selected mode (optional)
- `entropyMode`: `"system"` or `"system+user"` (optional, defaults to `"system"`)

Returns:

- `mode`
- `value`
- `entropy` (`bits`, `label`, `level`)
- `metadata` (mode-specific details plus selected entropy mode)

### Password example

```js
const result = window.WoolKeyAPI.generateCredential({
  mode: 'password',
  options: {
    length: 24,
    includeLowercase: true,
    includeUppercase: true,
    includeNumbers: true,
    includeSymbols: true,
    avoidAmbiguous: true,
    excludedCharacters: '',
  },
  entropyMode: 'system',
});

// Use result.value in your calling code without logging it.
```

### Passphrase example

```js
const result = window.WoolKeyAPI.generateCredential({
  mode: 'passphrase',
  options: {
    wordCount: 4,
    separator: 'hyphen',
    capitalize: false,
    addNumber: false,
  },
  entropyMode: 'system',
});
```

## HTTP endpoint for Postman

WoolKey now exposes a simple POST endpoint at:

`/api/generate`

This is useful for Postman or any other client that wants to submit JSON and inspect the
response.

### Request

- **Method:** `POST`
- **Content-Type:** `application/json`
- **Body:** JSON matching the same fields as the browser API

Example password request:

```json
{
  "mode": "password",
  "options": {
    "length": 24,
    "includeLowercase": true,
    "includeUppercase": true,
    "includeNumbers": true,
    "includeSymbols": true,
    "avoidAmbiguous": true,
    "excludedCharacters": ""
  },
  "entropyMode": "system"
}
```

Example passphrase request:

```json
{
  "mode": "passphrase",
  "options": {
    "wordCount": 4,
    "separator": "hyphen",
    "capitalize": false,
    "addNumber": false
  },
  "entropyMode": "system"
}
```

### Response

The endpoint returns JSON with:

- `mode`
- `value`
- `entropy`
- `metadata`

### Postman setup

1. Create a new request.
2. Set method to `POST`.
3. Use the URL `https://your-domain.example/api/generate`.
4. Set header `Content-Type: application/json`.
5. If you configured an auth token (see **Authentication** below), add a header `X-Api-Key: <your-token>`.
6. Paste one of the JSON bodies above into the request body (raw, JSON).
7. Send the request and inspect the JSON response.

### Authentication

By default the endpoint is open (dev/demo mode). To require a token:

1. Copy `api/config.example.php` to `api/config.php` on your server.
2. Generate a strong token:
   ```
   php -r "echo bin2hex(random_bytes(32));"
   ```
3. Set the token in `config.php`:
   ```php
   return ['api_token' => 'your-token-here'];
   ```
4. In Postman, add the header `X-Api-Key: your-token-here` to every request.

`config.php` is blocked from web access by `.htaccess` so it cannot be fetched by a browser.

### Rate limiting

The endpoint allows 20 requests per IP per 60 seconds. Excess requests receive HTTP 429.
