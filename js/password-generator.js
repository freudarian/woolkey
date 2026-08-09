/**
 * password-generator.js
 * Generates cryptographically secure passwords.
 * Depends on: crypto-random.js
 */

'use strict';

// These constants are internal to this script file.
// eslint-disable-next-line no-var
var _PW_CHAR_SETS = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  numbers:   '0123456789',
  symbols:   '!@#$%^&*()-_=+[]{};:,.?',
};
// eslint-disable-next-line no-var
var _PW_AMBIGUOUS = '0O1Il5S8B';

/**
 * Generate a secure password.
 *
 * @param {object} options
 * @param {number}  options.length            - Password length (8–128)
 * @param {boolean} options.includeLowercase
 * @param {boolean} options.includeUppercase
 * @param {boolean} options.includeNumbers
 * @param {boolean} options.includeSymbols
 * @param {boolean} options.avoidAmbiguous    - Exclude ambiguous characters
 * @param {string}  [options.excludedCharacters] - Extra characters to exclude
 * @returns {string} Generated password
 */
function generatePassword(options) {
  const {
    length = 16,
    includeLowercase = true,
    includeUppercase = true,
    includeNumbers = true,
    includeSymbols = false,
    avoidAmbiguous = false,
    excludedCharacters = '',
  } = options;

  if (!Number.isInteger(length) || length < 8 || length > 128) {
    throw new RangeError('Password length must be between 8 and 128');
  }

  const excluded = new Set([
    ...excludedCharacters,
    ...(avoidAmbiguous ? _PW_AMBIGUOUS : ''),
  ]);

  const filter = (str) => str.split('').filter((c) => !excluded.has(c)).join('');

  const groups = [];
  if (includeLowercase) {
    const set = filter(_PW_CHAR_SETS.lowercase);
    if (set.length > 0) groups.push(set);
  }
  if (includeUppercase) {
    const set = filter(_PW_CHAR_SETS.uppercase);
    if (set.length > 0) groups.push(set);
  }
  if (includeNumbers) {
    const set = filter(_PW_CHAR_SETS.numbers);
    if (set.length > 0) groups.push(set);
  }
  if (includeSymbols) {
    const set = filter(_PW_CHAR_SETS.symbols);
    if (set.length > 0) groups.push(set);
  }

  if (groups.length === 0) {
    throw new Error('At least one character group must be enabled');
  }
  if (length < groups.length) {
    throw new RangeError('Password length is too short for the selected character groups');
  }

  const fullPool = groups.join('');
  const chars = [];

  // Guarantee at least one character from each enabled group
  for (const group of groups) {
    chars.push(secureRandomCharacter(group));
  }

  // Fill the rest from the full pool
  while (chars.length < length) {
    chars.push(secureRandomCharacter(fullPool));
  }

  secureShuffle(chars);
  return chars.join('');
}

/**
 * Return the total pool size for the given options (used for entropy).
 * @param {object} options - Same options as generatePassword
 * @returns {number}
 */
function passwordPoolSize(options) {
  const {
    includeLowercase = true,
    includeUppercase = true,
    includeNumbers = true,
    includeSymbols = false,
    avoidAmbiguous = false,
    excludedCharacters = '',
  } = options;

  const excluded = new Set([
    ...excludedCharacters,
    ...(avoidAmbiguous ? _PW_AMBIGUOUS : ''),
  ]);
  const filter = (str) => str.split('').filter((c) => !excluded.has(c)).join('');

  let pool = '';
  if (includeLowercase) pool += filter(_PW_CHAR_SETS.lowercase);
  if (includeUppercase) pool += filter(_PW_CHAR_SETS.uppercase);
  if (includeNumbers)   pool += filter(_PW_CHAR_SETS.numbers);
  if (includeSymbols)   pool += filter(_PW_CHAR_SETS.symbols);
  return pool.length;
}
