const AuditLog = require('../models/AuditLog');

const SENSITIVE_FIELDS = [
  'password',
  'newPassword',
  'oldPassword',
  'token',
  'resetToken',
  'mfaToken',
  'otp',
  'otpHash',
  'secret',
  'jwt',
  'key',
  'razorpayKey',
  'razorpaySecret',
  'cvv',
  'cardNumber'
];

function sanitizeDetails(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeDetails);

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    const isSensitive = SENSITIVE_FIELDS.some(
      (field) => key.toLowerCase().includes(field.toLowerCase())
    );
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeDetails(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Record an audit log entry asynchronously without blocking request execution.
 */
async function recordAudit({
  actorId = null,
  actorEmail = '',
  actorRole = 'admin',
  action,
  entityType = 'system',
  entityId = '',
  ip = '',
  userAgent = '',
  status = 'success',
  details = {},
}) {
  try {
    const cleanDetails = sanitizeDetails(details);
    await AuditLog.create({
      actorId,
      actorEmail,
      actorRole,
      action,
      entityType,
      entityId: String(entityId || ''),
      ip: String(ip || ''),
      userAgent: String(userAgent || '').slice(0, 500),
      status,
      details: cleanDetails,
    });
  } catch (err) {
    // Non-blocking fallback
    console.error('[AuditLog] Failed to write audit log:', err.message);
  }
}

module.exports = {
  recordAudit,
  sanitizeDetails,
};
