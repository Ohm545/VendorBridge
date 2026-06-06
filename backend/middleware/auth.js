/**
 * Authentication & Authorization middleware
 */

const { verifyToken } = require('../utils/jwt');

/**
 * authenticateUser
 * Validates Bearer JWT from Authorization header or cookie.
 * Attaches decoded user to req.user.
 */
function authenticateUser(req, res, next) {
  try {
    let token = null;

    // Check Authorization header: "Bearer <token>"
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

    // Fallback: check cookie
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid authentication token.',
    });
  }
}

/**
 * authorizeRoles(...roles)
 * Returns middleware that restricts access to the specified roles.
 * Must be used AFTER authenticateUser.
 *
 * Usage: router.get('/admin', authenticateUser, authorizeRoles('admin'), handler)
 */
function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}.`,
      });
    }

    next();
  };
}

module.exports = { authenticateUser, authorizeRoles };
