const jwt = require('jsonwebtoken');

function signToken(userId, role) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  return jwt.sign(
    {
      sub: userId.toString(),
      role,
    },
    secret,
    { expiresIn }
  );
}

module.exports = { signToken };
