/**
 * agent-api.js
 * Programmatic generation API for automation/AI agents.
 *
 * This path never touches the network. It is the counterpart to the HTTP
 * endpoint (api/generate.php), not a client for it: the page's CSP sets
 * connect-src 'none' precisely so a generated credential can never leave the
 * browser. Agents driving a real page should call these functions; agents
 * speaking HTTP should call POST /api/generate instead.
 */

'use strict';

const WOOLKEY_API_VERSION = '1.1.0';
const _API_MAX_COUNT = 20;

function _apiFail(message, field) {
  const error = new Error(message);
  if (field) error.field = field;
  throw error;
}

function _apiEnum(value, allowed, fallback, field) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!allowed.includes(value)) {
    _apiFail(field + ' must be one of: ' + allowed.join(', '), field);
  }
  return value;
}

function _apiCount(value) {
  if (value === undefined || value === null) return 1;
  if (!Number.isInteger(value) || value < 1 || value > _API_MAX_COUNT) {
    _apiFail('count must be an integer between 1 and ' + _API_MAX_COUNT, 'count');
  }
  return value;
}

/**
 * Range-check an integer option up front so the caller gets the same message
 * and field name the HTTP endpoint would return, rather than a bare RangeError
 * thrown from deep inside the generator.
 */
function _apiInt(options, key, fallback, min, max) {
  const value = options[key];
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value)) _apiFail('options.' + key + ' must be an integer', 'options.' + key);
  if (value < min || value > max) {
    _apiFail('options.' + key + ' must be between ' + min + ' and ' + max, 'options.' + key);
  }
  return value;
}

function _apiStrength(bits) {
  const result = strengthLabel(bits);
  return { bits: Math.round(bits * 100) / 100, label: result.label, level: result.level };
}

/**
 * Configure entropy mixing and report how much user entropy is actually
 * available. An agent that calls this immediately on page load will see
 * userEntropySamples: 0 — 'system+user' only adds anything once a human (or a
 * synthetic pointer/key stream) has moved around the page.
 */
function _apiApplyEntropyMode(entropyMode) {
  const withUser = entropyMode === 'system+user';
  if (withUser) {
    if (typeof initUserEntropyCollector === 'function') initUserEntropyCollector();
    if (typeof setUserEntropyMixingEnabled === 'function') setUserEntropyMixingEnabled(true);
  } else if (typeof setUserEntropyMixingEnabled === 'function') {
    setUserEntropyMixingEnabled(false);
  }
  return (withUser && typeof userEntropySampleCount === 'function') ? userEntropySampleCount() : 0;
}

/**
 * Validate options once and return a copy with explicit defaults, so a request
 * body produces the same credential shape here as it does through
 * POST /api/generate. generatePassword() alone defaults length to 16 while the
 * server defaults to 24; pinning it here keeps the two transports in step.
 */
function _apiNormalizeOptions(mode, options) {
  if (mode === 'password') {
    return Object.assign({}, options, {
      length: _apiInt(options, 'length', 24, 8, 128),
    });
  }
  return Object.assign({}, options, {
    wordCount: _apiInt(options, 'wordCount', 4, 4, 8),
    separator: _apiEnum(options.separator, Object.keys(_PP_SEPARATORS), 'hyphen', 'options.separator'),
  });
}

function _apiOneResult(mode, options, entropyMode, samples) {
  if (mode === 'password') {
    const value = generatePassword(options);
    const poolSize = passwordPoolSize(options);
    return {
      value,
      entropy: _apiStrength(passwordEntropy(value.length, poolSize)),
      metadata: {
        entropyMode,
        poolSize,
        length: value.length,
        userEntropySamples: samples,
      },
    };
  }

  // Word count comes from the request, never from splitting the result: an
  // addNumber suffix would otherwise be counted as an extra word and inflate
  // both wordCount and the reported entropy.
  const wordCount = _apiInt(options, 'wordCount', 4, 4, 8);
  return {
    value: generatePassphrase(options),
    entropy: _apiStrength(passphraseEntropy(wordCount, WORDS.length)),
    metadata: {
      entropyMode,
      wordCount,
      wordListSize: WORDS.length,
      userEntropySamples: samples,
    },
  };
}

/**
 * Generate one or more credentials in a machine-friendly shape.
 *
 * Throws on invalid input. Out-of-range values are rejected rather than
 * clamped, so a caller never receives something quietly weaker than it asked
 * for. Use generate() for a non-throwing variant.
 *
 * @param {object} input
 * @param {'password'|'passphrase'} input.mode
 * @param {object} [input.options]
 * @param {number} [input.count=1] - 1–20
 * @param {'system'|'system+user'} [input.entropyMode='system']
 * @returns {{ mode: string, count: number, value: string, entropy: object, metadata: object, results: Array }}
 */
function generateCredential(input) {
  if (!isCryptoAvailable()) {
    throw new Error('Web Crypto API not available in this browser');
  }

  const payload = input || {};
  const mode = _apiEnum(payload.mode, ['password', 'passphrase'], '', 'mode');
  if (mode === '') _apiFail('mode is required and must be "password" or "passphrase"', 'mode');

  if (payload.options !== undefined && payload.options !== null
      && (typeof payload.options !== 'object' || Array.isArray(payload.options))) {
    _apiFail('options must be an object', 'options');
  }

  const options = _apiNormalizeOptions(mode, payload.options || {});
  const count = _apiCount(payload.count);
  const entropyMode = _apiEnum(payload.entropyMode, ['system', 'system+user'], 'system', 'entropyMode');
  const samples = _apiApplyEntropyMode(entropyMode);

  const results = [];
  for (let i = 0; i < count; i++) {
    results.push(_apiOneResult(mode, options, entropyMode, samples));
  }

  // Top-level fields mirror results[0] so single-result callers written against
  // the previous version keep working unchanged.
  return {
    mode,
    count,
    value: results[0].value,
    entropy: results[0].entropy,
    metadata: results[0].metadata,
    results,
  };
}

/**
 * Non-throwing wrapper. Preferred for browser automation, where an exception
 * raised inside an evaluate() call is awkward to inspect.
 *
 * @returns {{ ok: true, data: object } | { ok: false, error: string, field?: string }}
 */
function generate(input) {
  try {
    return { ok: true, data: generateCredential(input) };
  } catch (err) {
    const out = { ok: false, error: err && err.message ? err.message : String(err) };
    if (err && err.field) out.field = err.field;
    return out;
  }
}

/**
 * Machine-readable capability descriptor, mirroring GET /api/generate so an
 * agent can discover the contract from either transport.
 */
function describe() {
  return {
    name: 'WoolKey Credential Generator (browser)',
    version: WOOLKEY_API_VERSION,
    description: 'Generates cryptographically secure passwords and passphrases in-page via the Web Crypto API. No network request is made and no credential is stored.',
    transport: 'in-page',
    stateless: true,
    storage: 'none',
    cryptoAvailable: isCryptoAvailable(),
    limits: { maxCount: _API_MAX_COUNT },
    request: {
      mode: { type: 'string', required: true, enum: ['password', 'passphrase'] },
      count: { type: 'integer', required: false, default: 1, min: 1, max: _API_MAX_COUNT },
      entropyMode: {
        type: 'string',
        required: false,
        default: 'system',
        enum: ['system', 'system+user'],
        note: '"system+user" mixes pointer/keyboard timing into the CSPRNG output. Check metadata.userEntropySamples — it is 0 until input has been observed.',
      },
    },
    modes: {
      password: {
        options: {
          length: { type: 'integer', default: 24, min: 8, max: 128 },
          includeLowercase: { type: 'boolean', default: true },
          includeUppercase: { type: 'boolean', default: true },
          includeNumbers: { type: 'boolean', default: true },
          includeSymbols: { type: 'boolean', default: false },
          avoidAmbiguous: { type: 'boolean', default: false, note: 'Excludes ' + _PW_AMBIGUOUS },
          excludedCharacters: { type: 'string', default: '' },
        },
        symbolSet: _PW_CHAR_SETS.symbols,
      },
      passphrase: {
        options: {
          wordCount: { type: 'integer', default: 4, min: 4, max: 8 },
          separator: { type: 'string', default: 'hyphen', enum: Object.keys(_PP_SEPARATORS) },
          capitalize: { type: 'boolean', default: false },
          addNumber: { type: 'boolean', default: false, note: 'Appends a two-digit suffix; not counted toward entropy.' },
        },
        wordListSize: Array.isArray(WORDS) ? WORDS.length : 0,
      },
    },
    strengthLevels: [
      { level: 0, label: 'Weak', minBits: 0 },
      { level: 1, label: 'Fair', minBits: 40 },
      { level: 2, label: 'Strong', minBits: 60 },
      { level: 3, label: 'Very strong', minBits: 80 },
      { level: 4, label: 'Excellent', minBits: 100 },
    ],
  };
}

/**
 * Expose API for browser automation and extension contexts.
 */
window.WoolKeyAPI = {
  version: WOOLKEY_API_VERSION,
  ready: true,
  generateCredential,
  generate,
  describe,
};

// Automation that attaches before scripts finish parsing can wait on this
// instead of polling for window.WoolKeyAPI.
window.dispatchEvent(new CustomEvent('woolkey:ready', {
  detail: { version: WOOLKEY_API_VERSION },
}));
