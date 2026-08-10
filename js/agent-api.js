/**
 * agent-api.js
 * Programmatic generation API for automation/AI agents.
 */

'use strict';

function _apiNormalizeMode(mode) {
  if (mode === 'password' || mode === 'passphrase') return mode;
  throw new Error('mode must be "password" or "passphrase"');
}

function _apiStrength(bits) {
  const result = strengthLabel(bits);
  return { bits, label: result.label, level: result.level };
}

function _apiDefaultEntropyMode(entropyMode) {
  if (entropyMode === undefined || entropyMode === null || entropyMode === '') return 'system';
  if (entropyMode === 'system' || entropyMode === 'system+user') return entropyMode;
  throw new Error('entropyMode must be "system" or "system+user"');
}

/**
 * Generate a credential in a machine-friendly shape.
 *
 * @param {object} input
 * @param {'password'|'passphrase'} input.mode
 * @param {object} [input.options]
 * @param {'system'|'system+user'} [input.entropyMode]
 * @returns {{ mode: string, value: string, entropy: { bits: number, label: string, level: number }, metadata: object }}
 */
function generateCredential(input) {
  if (!isCryptoAvailable()) {
    throw new Error('Web Crypto API not available in this browser');
  }
  const payload = input || {};
  const mode = _apiNormalizeMode(payload.mode);
  const options = payload.options || {};
  const entropyMode = _apiDefaultEntropyMode(payload.entropyMode);

  const withUserEntropy = entropyMode === 'system+user';
  if (withUserEntropy) {
    if (typeof initUserEntropyCollector === 'function') initUserEntropyCollector();
    if (typeof setUserEntropyMixingEnabled === 'function') setUserEntropyMixingEnabled(true);
  } else if (typeof setUserEntropyMixingEnabled === 'function') {
    setUserEntropyMixingEnabled(false);
  }

  if (mode === 'password') {
    const value = generatePassword(options);
    const poolSize = passwordPoolSize(options);
    const bits = passwordEntropy(value.length, poolSize);
    return {
      mode,
      value,
      entropy: _apiStrength(bits),
      metadata: {
        entropyMode,
        poolSize,
        length: value.length,
      },
    };
  }

  const value = generatePassphrase(options);
  const words = String(value).trim() === '' ? [] : String(value).split(/\s+|[-_.]/).filter(Boolean);
  const bits = passphraseEntropy(words.length, WORDS.length);
  return {
    mode,
    value,
    entropy: _apiStrength(bits),
    metadata: {
      entropyMode,
      wordCount: words.length,
      wordListSize: WORDS.length,
    },
  };
}

/**
 * Expose API for browser automation and extension contexts.
 */
window.WoolKeyAPI = {
  generateCredential,
};
