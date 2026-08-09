/**
 * passphrase-generator.js
 * Generates cryptographically secure passphrases from a local word list.
 * Depends on: crypto-random.js, data/words.js
 */

'use strict';

function generatePassphrase(options) {
  const SEPARATORS = {
    hyphen: '-',
    underscore: '_',
    dot: '.',
    space: ' ',
  };

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

  const sep = SEPARATORS[separator] !== undefined ? SEPARATORS[separator] : '-';
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
    passphrase += sep + secureRandomInt(100);
  }

  return passphrase;
}
