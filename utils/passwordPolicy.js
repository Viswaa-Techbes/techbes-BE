const COMMON_WEAK_PASSWORDS = new Set([
  'admin*#123',
  'admin@123456',
  'admin123456!',
  'password1234!',
  'techbes@12345',
  '123456789012',
  'qwertyuiop12',
  'administrator1!',
  'superadmin123!',
  'welcome123456!'
]);

/**
 * Validates a password against strong enterprise policy.
 * Requirements:
 * - At least 12 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 digit
 * - At least 1 special character
 * - Not in common dictionary of weak passwords
 *
 * @param {string} password
 * @returns {{ valid: boolean, message?: string }}
 */
function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required' };
  }

  if (password.length < 12) {
    return {
      valid: false,
      message: 'Password must be at least 12 characters long',
    };
  }

  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one uppercase letter (A-Z)',
    };
  }

  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one lowercase letter (a-z)',
    };
  }

  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one number (0-9)',
    };
  }

  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one special character (!@#$%^&*)',
    };
  }

  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase().trim())) {
    return {
      valid: false,
      message: 'Password is too common. Please choose a more secure, unique passphrase.',
    };
  }

  return { valid: true };
}

module.exports = {
  validatePasswordStrength,
};
