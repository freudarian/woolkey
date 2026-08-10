# woolkey
Woolkey secure password generator by CoolerSheep

## Agent API

WoolKey now exposes a programmatic browser API for automation and AI agents:

`window.WoolKeyAPI.generateCredential(input)`

Input shape:

- `mode`: `"password"` or `"passphrase"` (required)
- `options`: generator options for the selected mode (optional)
- `entropyMode`: `"system"` or `"system+user"` (optional, defaults to `"system"`)

Returns:

- `mode`
- `value`
- `entropy` (`bits`, `label`, `level`)
- `metadata` (mode-specific details plus selected entropy mode)

Example:

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
