/**
 * JWT utility helpers
 */

const jwt = require('jsonwebtoken');

const SECRET  = process.env.JWT_SECRET;
const EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Sign a JWT for the given user object.
 */
function signToken(user) {
  return jwt.sign(
    {
      id:       user.id,
      email:    user.email,
      role:     user.role,
      fullName: user.full_name,
    },
    SECRET,
    { expiresIn: EXPIRES }
  );
}

/**
 * Verify and decode a JWT.
 * Returns the decoded payload or throws.
 */
function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signToken, verifyToken };
