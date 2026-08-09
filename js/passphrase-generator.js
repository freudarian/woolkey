/**
 * passphrase-generator.js
 * Generates cryptographically secure passphrases from a local word list.
 * Depends on: crypto-random.js, data/words.js
 */

'use strict';

// eslint-disable-next-line no-var
var _PP_SEPARATORS = {
  hyphen: '-',
  underscore: '_',
  dot: '.',
  space: ' ',
};

/**
 * Generate a secure passphrase.
 *
 * @param {object} options
 * @param {number}  options.wordCount         - Number of words (4–8)
 * @param {string}  options.separator         - 'hyphen'|'underscore'|'dot'|'space'
 * @param {boolean} options.capitalize        - Capitalize first letter of each word
 * @param {boolean} options.addNumber         - Append a two-digit number suffix (00–99)
 * @returns {string} Generated passphrase
 */
function generatePassphrase(options) {
  const {
    wordCount = 4,
    separator = 'hyphen',
    capitalize = false,
    addNumber = false,
  } = options;

  if (!Number.isInteger(wordCount) || wordCount < 4 || wordCount > 8) {
    throw new RangeError('Word count must be between 4 and 8');
  }
  if (!Array.isArray(WORDS) || WORDS.length < 2) {
    throw new Error('Word list is not loaded');
  }

  const sep = _PP_SEPARATORS[separator] !== undefined ? _PP_SEPARATORS[separator] : '-';
  const words = [];

  for (let i = 0; i < wordCount; i++) {
    let word = WORDS[secureRandomInt(WORDS.length)];
    if (capitalize) {
      word = word.charAt(0).toUpperCase() + word.slice(1);
    }
    words.push(word);
  }

  let passphrase = words.join(sep);

  if (addNumber) {
    const num = secureRandomInt(100);
    passphrase += sep + String(num).padStart(2, '0');
  }

  return passphrase;
}
