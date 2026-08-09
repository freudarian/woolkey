/**
 * crypto-random.js
 * Secure randomness primitives using Web Crypto API only.
 * Never uses Math.random().
 */

'use strict';

/**
 * Returns a cryptographically secure random integer in [0, maxExclusive).
 * Uses rejection sampling to avoid modulo bias.
 * @param {number} maxExclusive - Upper bound (exclusive), must be >= 2
 * @returns {number}
 */
function secureRandomInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 2) {
    throw new RangeError('maxExclusive must be an integer >= 2');
  }
  const bytesNeeded = Math.ceil(Math.log2(maxExclusive) / 8) || 1;
  const maxValue = Math.pow(256, bytesNeeded);
  const limit = maxValue - (maxValue % maxExclusive);
  const buf = new Uint8Array(bytesNeeded);
  let value;
  do {
    crypto.getRandomValues(buf);
    value = 0;
    for (let i = 0; i < bytesNeeded; i++) {
      value = value * 256 + buf[i];
    }
  } while (value >= limit);
  return value % maxExclusive;
}

/**
 * Returns a cryptographically secure random character from the given string.
 * @param {string} set - Character set to pick from
 * @returns {string}
 */
function secureRandomCharacter(set) {
  if (!set || set.length < 1) {
    throw new RangeError('Character set must be non-empty');
  }
  if (set.length === 1) return set[0];
  return set[secureRandomInt(set.length)];
}

/**
 * Fisher–Yates shuffle using secureRandomInt. Mutates the array in place.
 * @param {Array} array
 * @returns {Array}
 */
function secureShuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Returns true if Web Crypto API is available and functional.
 * @returns {boolean}
 */
function isCryptoAvailable() {
  try {
    if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
      return false;
    }
    const test = new Uint8Array(1);
    crypto.getRandomValues(test);
    return true;
  } catch {
    return false;
  }
}
