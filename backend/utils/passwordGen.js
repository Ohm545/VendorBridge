/**
 * Temporary password generator
 */

const crypto = require('crypto');

function generateTempPassword(length = 12) {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const special = '!@#$%&*';
  const all     = upper + lower + digits + special;

  let pw = '';
  // Ensure at least one of each required type
  pw += upper[crypto.randomInt(upper.length)];
  pw += lower[crypto.randomInt(lower.length)];
  pw += digits[crypto.randomInt(digits.length)];
  pw += special[crypto.randomInt(special.length)];

  for (let i = 4; i < length; i++) {
    pw += all[crypto.randomInt(all.length)];
  }

  // Shuffle
  return pw.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

module.exports = { generateTempPassword };
