const nodemailer = require('nodemailer');

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

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP is not configured');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465,
    auth: { user, pass },
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

async function sendOtpEmail(email, otp) {
  const transporter = getTransporter();
  const rawFrom = process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER;
  const from = formatFromAddress(rawFrom);

  await transporter.sendMail({
    from,
    to: email,
    subject: 'Your Techbes verification code',
    text: `Your verification code is: ${otp}\n\nThis code expires in 5 minutes.`,
    html: otpTemplate(otp),
  });
}

async function verifySmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  const isPlaceholder = !user || !pass || 
    user.includes('your-email@gmail.com') || 
    user.includes('your_email@gmail.com') || 
    pass.includes('your-app-password') || 
    pass.includes('your_app_password');

  if (!host || !user || !pass || isPlaceholder) {
    console.warn('⚠️ WARNING: SMTP email environment variables are missing, incomplete, or contain placeholder values. Email service will be unavailable.');
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465,
      auth: { user, pass },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
    });

    await transporter.verify();
    console.log('✅ SMTP email transporter configured and verified successfully.');
    return true;
  } catch (error) {
    console.warn(`⚠️ WARNING: SMTP verification failed during startup: ${error.message}. The server will remain active but email delivery might fail.`);
    return false;
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
  const transporter = getTransporter();
  const rawFrom = process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER;
  const from = formatFromAddress(rawFrom);

  const subject = `${courseName} – Online Class Link`;

  const plainText = `Hello ${name},

Thank you for registering for the ${courseName}.

Your online class details are below:

Course:
${courseName}
${classDate ? `\nDate:\n${classDate}` : ''}
${classTime ? `\nTime:\n${classTime}` : ''}

Join the online class:
${zoomLink}

${message ? `Note from instructor:\n${message}\n\n` : ''}Please join a few minutes before the scheduled class.

Regards,
TechBes Team

TechBes
IT Services & CCTV Solutions
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
                  <p style="margin:0 0 24px 0;font-size:15px;color:#cbd5e1;line-height:1.6;">Thank you for registering for the <strong>${courseName}</strong>. Your online class details and Zoom access link are ready below.</p>

                  <!-- Details Box -->
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1e293b;border:1px solid #334155;border-radius:12px;margin-bottom:28px;">
                    <tr>
                      <td style="padding:20px 24px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="padding-bottom:12px;color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Course</td>
                            <td style="padding-bottom:12px;color:#ffffff;font-size:14px;font-weight:700;text-align:right;">${courseName}</td>
                          </tr>
                          ${classDate ? `
                          <tr>
                            <td style="padding-bottom:12px;color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Date</td>
                            <td style="padding-bottom:12px;color:#ffffff;font-size:14px;font-weight:700;text-align:right;">${classDate}</td>
                          </tr>
                          ` : ''}
                          ${classTime ? `
                          <tr>
                            <td style="padding-bottom:12px;color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Time</td>
                            <td style="padding-bottom:12px;color:#ffffff;font-size:14px;font-weight:700;text-align:right;">${classTime}</td>
                          </tr>
                          ` : ''}
                          <tr>
                            <td style="color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Platform</td>
                            <td style="color:#38bdf8;font-size:14px;font-weight:700;text-align:right;">Zoom Video Meeting</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>

                  <!-- Custom Message -->
                  ${message ? `
                  <div style="background-color:#1e293b;border-left:4px solid #e5a833;border-radius:4px;padding:14px 18px;margin-bottom:24px;color:#e2e8f0;font-size:13.5px;line-height:1.5;">
                    <strong style="color:#e5a833;display:block;margin-bottom:4px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Instructor Note:</strong>
                    ${message}
                  </div>
                  ` : ''}

                  <!-- CTA Button -->
                  <div style="text-align:center;margin:32px 0 24px 0;">
                    <a href="${zoomLink}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#e5a833;color:#0b0f19;font-size:15px;font-weight:800;letter-spacing:0.5px;padding:14px 32px;border-radius:8px;text-decoration:none;box-shadow:0 4px 14px rgba(229,168,51,0.35);">JOIN ONLINE CLASS</a>
                  </div>

                  <!-- Direct Link -->
                  <p style="margin:0 0 20px 0;font-size:12px;color:#94a3b8;text-align:center;word-break:break-all;">
                    Or copy & paste this direct URL:<br>
                    <a href="${zoomLink}" style="color:#38bdf8;text-decoration:underline;">${zoomLink}</a>
                  </p>

                  <p style="margin:24px 0 0 0;font-size:13px;color:#cbd5e1;line-height:1.6;border-top:1px solid #1f2937;padding-top:20px;">
                    Please join a few minutes before the scheduled class start time. Ensure you have Zoom installed on your phone or laptop.
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

  return transporter.sendMail({
    from,
    to,
    subject,
    text: plainText,
    html,
  });
}

module.exports = {
  sendOtpEmail,
  sendZoomClassEmail,
  verifySmtpConfig,
  formatFromAddress,
  getTransporter,
};
