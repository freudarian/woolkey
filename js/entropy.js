/**
 * entropy.js
 * Entropy calculation and strength labels for passwords and passphrases.
 */

'use strict';

/**
 * Calculate entropy for a password.
 * @param {number} length - Password length
 * @param {number} poolSize - Total character pool size
 * @returns {number} Entropy in bits
 */
function passwordEntropy(length, poolSize) {
  if (poolSize <= 0 || length <= 0) return 0;
  return length * Math.log2(poolSize);
}

/**
 * Calculate entropy for a passphrase.
 * @param {number} wordCount - Number of words
 * @param {number} wordListSize - Size of the word list
 * @returns {number} Entropy in bits
 */
function passphraseEntropy(wordCount, wordListSize) {
  if (wordListSize <= 0 || wordCount <= 0) return 0;
  return wordCount * Math.log2(wordListSize);
}

/**
 * Returns a human-readable strength label for a given entropy value.
 * @param {number} bits - Entropy in bits
 * @returns {{ label: string, level: number }} level: 0=weak … 4=excellent
 */
function strengthLabel(bits) {
  if (bits < 40)  return { label: 'Weak',        level: 0 };
  if (bits < 60)  return { label: 'Fair',        level: 1 };
  if (bits < 80)  return { label: 'Strong',      level: 2 };
  if (bits < 100) return { label: 'Very strong', level: 3 };
  return            { label: 'Excellent',    level: 4 };
}

/**
 * Format entropy value for display.
 * @param {number} bits
 * @returns {string}
 */
function formatEntropy(bits) {
  return Math.round(bits) + ' bits';
}
