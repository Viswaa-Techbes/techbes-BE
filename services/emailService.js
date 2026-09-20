const nodemailer = require('nodemailer');
const dns = require('dns');
const net = require('net');

// Force IPv4 DNS resolution across all email transporter operations
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

// Suppress IPv6 inside Nodemailer's internal shared resolver
// (Prevents ENETUNREACH on Linux VPS servers without external IPv6 routes)
try {
  const nodemailerShared = require('nodemailer/lib/shared');
  if (nodemailerShared) {
    // 1. Strip IPv6 interfaces so isFamilySupported(6) returns false
    if (nodemailerShared.networkInterfaces) {
      const v4Only = {};
      for (const [key, addrs] of Object.entries(nodemailerShared.networkInterfaces)) {
        v4Only[key] = (addrs || []).filter(a => a.family === 'IPv4' || a.family === 4);
      }
      nodemailerShared.networkInterfaces = v4Only;
    }

    // 2. Intercept resolveHostname to strictly filter out any IPv6 addresses returned
    const origResolveHostname = nodemailerShared.resolveHostname;
    if (typeof origResolveHostname === 'function') {
      nodemailerShared.resolveHostname = function (options, callback) {
        origResolveHostname(options, (err, resolved) => {
          if (err || !resolved) return callback(err, resolved);
          if (Array.isArray(resolved._addresses)) {
            resolved._addresses = resolved._addresses.filter(a => typeof a === 'string' && !a.includes(':'));
          }
          if (resolved.host && typeof resolved.host === 'string' && resolved.host.includes(':')) {
            resolved.host = resolved._addresses && resolved._addresses.length > 0
              ? resolved._addresses[0]
              : options.host;
          }
          callback(null, resolved);
        });
      };
    }
  }
} catch (e) {
  console.warn('[SMTP] Could not patch nodemailer/lib/shared for IPv4 enforcement:', e.message);
}

// In-memory IPv4 DNS cache to bypass Nodemailer's internal DNS picker
let cachedIpv4Host = null;
let lastIpv4Resolve = 0;

async function resolveIpv4Host(hostname) {
  if (!hostname || net.isIP(hostname)) return hostname;
  const now = Date.now();
  if (cachedIpv4Host && (now - lastIpv4Resolve < 300000)) {
    return cachedIpv4Host;
  }
  try {
    const { address } = await dns.promises.lookup(hostname, { family: 4 });
    if (address && !address.includes(':')) {
      cachedIpv4Host = address;
      lastIpv4Resolve = now;
      return address;
    }
  } catch (err) {
    console.warn(`[SMTP DNS] Pre-resolving IPv4 for ${hostname} failed: ${err.message}`);
  }
  return hostname;
}

function formatFromAddress(from) {
  if (!from) return from;
  from = from.trim();
  if (from.includes('<') && from.includes('>')) return from;
  const parts = from.split(/\s+/);
  if (parts.length > 1) {
    const email = parts.pop();
    const name = parts.join(' ');
    const cleanName = name.replace(/^["']|["']$/g, '');
    return `"${cleanName}" <${email}>`;
  }
  return from;
}

function getTransporter(customPort, customSecure, customHost) {
  const baseHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const host = customHost || baseHost;
  const defaultPort = 587;
  const port = Number(customPort !== undefined ? customPort : (process.env.SMTP_PORT || defaultPort));
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!baseHost || !user || !pass) {
    throw new Error('SMTP is not configured');
  }

  const secure = customSecure !== undefined 
    ? customSecure 
    : (String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465);

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    family: 4,               // Force IPv4 only to prevent Linux VPS ENETUNREACH on unreachable IPv6 routes
    requireTLS: !secure,     // require STARTTLS on port 587
    connectionTimeout: 20000, // 20 seconds timeout for TCP connection
    greetingTimeout: 20000,   // 20 seconds timeout for SMTP greeting
    socketTimeout: 30000,    // 30 seconds timeout for socket inactivity
    tls: {
      servername: baseHost,  // Always verify against canonical hostname e.g. smtp.gmail.com for TLS
    },
  });
}

function otpTemplate(otp) {
  return `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:32px;color:#0f172a">
      <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
        <div style="padding:24px;border-bottom:1px solid #e2e8f0">
          <h1 style="margin:0;font-size:22px">Verify your Techbes account</h1>
          <p style="margin:8px 0 0;color:#64748b">Use this code to finish creating your account.</p>
        </div>
        <div style="padding:28px 24px">
          <p style="margin:0 0 12px;color:#475569">Your verification code is:</p>
          <div style="font-size:32px;letter-spacing:8px;font-weight:700;color:#059669">${otp}</div>
          <p style="margin:20px 0 0;color:#64748b">This code expires in 5 minutes.</p>
        </div>
      </div>
    </div>
  `;
}

async function sendMailWithTimeout(transporter, mailOptions, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { transporter.close(); } catch {}
        reject(new Error(`SMTP connection timeout after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    transporter.sendMail(mailOptions)
      .then((res) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(res);
        }
      })
      .catch((err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}

/**
 * Sends an email with automatic dual-port fallback between port 465 (SSL) and port 587 (STARTTLS).
 * Ensures resilient delivery on cloud VPS instances where port 587 can experience socket negotiation latency.
 */
async function sendMailWithResilience(mailOptions, timeoutMs = 20000) {
  const baseHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  
  // Primary port 587 (STARTTLS) or explicit SMTP_PORT, with fallback to 465 (SSL)
  const envPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const primaryPort = envPort !== undefined ? envPort : 587;
  const primarySecure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || primaryPort === 465;

  const fallbackPort = primaryPort === 465 ? 587 : 465;
  const fallbackSecure = fallbackPort === 465;

  console.log(`[SMTP] Resolving host ${baseHost}...`);
  const resolvedHost = await resolveIpv4Host(baseHost);
  console.log(`[SMTP] Resolved IPv4: ${resolvedHost}`);

  try {
    console.log(`[SMTP] Connecting to port ${primaryPort} (secure: ${primarySecure})...`);
    const primaryTransporter = getTransporter(primaryPort, primarySecure, resolvedHost);
    const result = await sendMailWithTimeout(primaryTransporter, mailOptions, timeoutMs);
    console.log(`[SMTP] Primary SMTP delivery on port ${primaryPort} succeeded.`);
    return result;
  } catch (primaryErr) {
    console.warn(`[SMTP] Primary attempt on port ${primaryPort} failed (${primaryErr.message}). Trying fallback port ${fallbackPort}...`);
    try {
      console.log(`[SMTP] Connecting to fallback port ${fallbackPort} (secure: ${fallbackSecure})...`);
      const fallbackTransporter = getTransporter(fallbackPort, fallbackSecure, resolvedHost);
      const result = await sendMailWithTimeout(fallbackTransporter, mailOptions, timeoutMs);
      console.log(`[SMTP] Fallback delivery on port ${fallbackPort} succeeded.`);
      return result;
    } catch (fallbackErr) {
      console.error(`[SMTP] Fallback attempt on port ${fallbackPort} also failed: ${fallbackErr.message}`);
      throw new Error(`SMTP delivery failed on both ports (${primaryPort}: ${primaryErr.message}; ${fallbackPort}: ${fallbackErr.message})`);
    }
  }
}

async function sendOtpEmail(email, otp) {
  const rawFrom = process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER;
  const from = formatFromAddress(rawFrom);

  const mailOptions = {
    from,
    to: email,
    subject: 'Your Techbes verification code',
    text: `Your verification code is: ${otp}\n\nThis code expires in 5 minutes.`,
    html: otpTemplate(otp),
  };

  return await sendMailWithResilience(mailOptions, 10000);
}

async function verifySmtpConfig() {
  const baseHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  const isPlaceholder = !user || !pass || 
    user.includes('your-email') || 
    user.includes('your_email') || 
    pass.includes('your-app-password');

  if (!baseHost || !user || !pass || isPlaceholder) {
    console.warn('⚠️ WARNING: SMTP email environment variables are missing, incomplete, or contain placeholder values. Email service will be unavailable.');
    return false;
  }

  const resolvedHost = await resolveIpv4Host(baseHost);

  try {
    const transporter = getTransporter(port, undefined, resolvedHost);
    await transporter.verify();
    console.log(`✅ SMTP email transporter configured and verified successfully on port ${port} (IPv4: ${resolvedHost}).`);
    return true;
  } catch (error) {
    console.warn(`⚠️ WARNING: SMTP verification failed on port ${port}: ${error.message}. Testing alternate port...`);
    const altPort = port === 465 ? 587 : 465;
    try {
      const altTransporter = getTransporter(altPort, undefined, resolvedHost);
      await altTransporter.verify();
      console.log(`✅ Alternate SMTP port ${altPort} verified successfully (IPv4: ${resolvedHost}).`);
      return true;
    } catch (altErr) {
      console.warn(`⚠️ WARNING: Alternate SMTP port ${altPort} also failed: ${altErr.message}. The server will remain active but email delivery might fail.`);
      return false;
    }
  }
}

/**
 * Sends a branded Zoom Online Class Link email to an individual student.
 */
async function sendZoomClassEmail({
  to,
  name,
  courseName = 'TechBes CCTV Masterclass',
  classDate = '',
  classTime = '',
  zoomLink,
  message = '',
}) {
  const rawFrom = process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER;
  const from = formatFromAddress(rawFrom);

  const subject = 'TechBes CCTV Masterclass – Live Class Link';

  const plainText = `Hello ${name},

Your CCTV Masterclass live class details are ready.

Join the live session using the link below:

${zoomLink}
${classDate ? `\nDate:\n${classDate}` : ''}${classTime ? `\nTime:\n${classTime}` : ''}
${message ? `\nNote from instructor:\n${message}\n` : ''}
Please join a few minutes before the scheduled session.

Regards,
TechBes Team

TechBes IT Services & CCTV Solutions
https://techbes.co.in
`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="margin:0;padding:0;background-color:#0b0f19;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#ffffff;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0b0f19;padding:32px 16px;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;background-color:#111827;border:1px solid #1f2937;border-radius:16px;overflow:hidden;box-shadow:0 20px 25px -5px rgba(0,0,0,0.5);">
              <!-- Header -->
              <tr>
                <td style="padding:28px 32px;background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%);border-bottom:1px solid #374151;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td>
                        <div style="color:#e5a833;font-size:22px;font-weight:900;letter-spacing:1px;text-transform:uppercase;">TECHBES</div>
                        <div style="color:#94a3b8;font-size:11px;font-weight:600;letter-spacing:0.5px;margin-top:2px;">IT SERVICES & CCTV SOLUTIONS</div>
                      </td>
                      <td align="right">
                        <span style="display:inline-block;padding:4px 12px;background:rgba(229,168,51,0.12);border:1px solid rgba(229,168,51,0.3);border-radius:20px;color:#e5a833;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Live Class Link</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Content -->
              <tr>
                <td style="padding:32px 32px 24px 32px;">
                  <p style="margin:0 0 16px 0;font-size:16px;color:#f3f4f6;line-height:1.6;">Hello <strong style="color:#ffffff;">${name}</strong>,</p>
                  <p style="margin:0 0 20px 0;font-size:15px;color:#cbd5e1;line-height:1.6;">Your CCTV Masterclass live class details are ready.</p>
                  <p style="margin:0 0 24px 0;font-size:15px;color:#cbd5e1;line-height:1.6;">Join the live session using the link below:</p>

                  <!-- CTA Button -->
                  <div style="text-align:center;margin:28px 0 24px 0;">
                    <a href="${zoomLink}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#e5a833;color:#0b0f19;font-size:15px;font-weight:800;letter-spacing:0.5px;padding:15px 36px;border-radius:8px;text-decoration:none;box-shadow:0 4px 14px rgba(229,168,51,0.35);">JOIN LIVE SESSION</a>
                  </div>

                  <!-- Direct Link -->
                  <p style="margin:0 0 24px 0;font-size:12.5px;color:#94a3b8;text-align:center;word-break:break-all;">
                    Or click or copy this direct meeting link:<br>
                    <a href="${zoomLink}" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;text-decoration:underline;">${zoomLink}</a>
                  </p>

                  <!-- Details Box -->
                  ${(classDate || classTime) ? `
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1e293b;border:1px solid #334155;border-radius:12px;margin-bottom:24px;">
                    <tr>
                      <td style="padding:16px 20px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="padding-bottom:8px;color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Course</td>
                            <td style="padding-bottom:8px;color:#ffffff;font-size:13.5px;font-weight:700;text-align:right;">${courseName}</td>
                          </tr>
                          ${classDate ? `
                          <tr>
                            <td style="padding-bottom:8px;color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Date</td>
                            <td style="padding-bottom:8px;color:#ffffff;font-size:13.5px;font-weight:700;text-align:right;">${classDate}</td>
                          </tr>
                          ` : ''}
                          ${classTime ? `
                          <tr>
                            <td style="color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Time</td>
                            <td style="color:#ffffff;font-size:13.5px;font-weight:700;text-align:right;">${classTime}</td>
                          </tr>
                          ` : ''}
                        </table>
                      </td>
                    </tr>
                  </table>
                  ` : ''}

                  <!-- Custom Message -->
                  ${message ? `
                  <div style="background-color:#1e293b;border-left:4px solid #e5a833;border-radius:4px;padding:14px 18px;margin-bottom:24px;color:#e2e8f0;font-size:13.5px;line-height:1.5;">
                    <strong style="color:#e5a833;display:block;margin-bottom:4px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Instructor Note:</strong>
                    ${message}
                  </div>
                  ` : ''}

                  <p style="margin:24px 0 0 0;font-size:13px;color:#cbd5e1;line-height:1.6;border-top:1px solid #1f2937;padding-top:20px;">
                    Please join a few minutes before the scheduled session. Ensure you have the Zoom app installed on your smartphone or laptop.
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding:24px 32px;background-color:#0f172a;border-top:1px solid #1f2937;text-align:center;">
                  <p style="margin:0 0 6px 0;font-size:13px;color:#94a3b8;">Regards,</p>
                  <p style="margin:0 0 12px 0;font-size:14px;font-weight:700;color:#e5a833;">TechBes Team</p>
                  <p style="margin:0;font-size:11px;color:#64748b;">
                    TechBes IT Services & CCTV Solutions &bull;
                    <a href="https://techbes.co.in" style="color:#64748b;text-decoration:none;">techbes.co.in</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  return await sendMailWithResilience({
    from,
    to,
    subject,
    text: plainText,
    html,
  }, 20000);
}

module.exports = {
  sendOtpEmail,
  sendMailWithTimeout,
  sendMailWithResilience,
  sendZoomClassEmail,
  verifySmtpConfig,
  formatFromAddress,
  getTransporter,
};
