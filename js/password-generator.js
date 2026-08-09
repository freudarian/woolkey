/**
 * password-generator.js
 * Generates cryptographically secure passwords.
 * Depends on: crypto-random.js
 */

'use strict';

function generatePassword(options) {
  const CHAR_SETS = {
    lowercase: 'abcdefghijklmnopqrstuvwxyz',
    uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    numbers:   '0123456789',
    symbols:   '!@#$%^&*()-_=+[]{};:,.?',
  };
  const AMBIGUOUS_CHARS = '0O1Il5S8B';

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
    ...(avoidAmbiguous ? AMBIGUOUS_CHARS : ''),
  ]);

  const filter = (str) => str.split('').filter((c) => !excluded.has(c)).join('');

  const groups = [];
  if (includeLowercase) {
    const set = filter(CHAR_SETS.lowercase);
    if (set.length > 0) groups.push(set);
  }
  if (includeUppercase) {
    const set = filter(CHAR_SETS.uppercase);
    if (set.length > 0) groups.push(set);
  }
  if (includeNumbers) {
    const set = filter(CHAR_SETS.numbers);
    if (set.length > 0) groups.push(set);
  }
  if (includeSymbols) {
    const set = filter(CHAR_SETS.symbols);
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
  const CHAR_SETS = {
    lowercase: 'abcdefghijklmnopqrstuvwxyz',
    uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    numbers:   '0123456789',
    symbols:   '!@#$%^&*()-_=+[]{};:,.?',
  };
  const AMBIGUOUS_CHARS = '0O1Il5S8B';
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
    ...(avoidAmbiguous ? AMBIGUOUS_CHARS : ''),
  ]);
  const filter = (str) => str.split('').filter((c) => !excluded.has(c)).join('');

  let pool = '';
  if (includeLowercase) pool += filter(CHAR_SETS.lowercase);
  if (includeUppercase) pool += filter(CHAR_SETS.uppercase);
  if (includeNumbers)   pool += filter(CHAR_SETS.numbers);
  if (includeSymbols)   pool += filter(CHAR_SETS.symbols);
  return pool.length;
}
