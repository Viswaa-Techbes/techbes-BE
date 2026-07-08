/**
 * Email HTML Templates
 * Returns styled HTML for TechBes transactional emails.
 */

const BRAND_COLOR = '#1565C0';
const ACCENT_COLOR = '#E64A19';

function getEmailTemplate(type, subject, bodyText, data = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f7fb; font-family: 'Segoe UI', Arial, sans-serif; }
    .wrapper { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, ${BRAND_COLOR} 0%, #1976D2 100%); padding: 32px 40px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.5px; }
    .header p { color: rgba(255,255,255,0.8); margin: 6px 0 0; font-size: 14px; }
    .body { padding: 40px; }
    .body p { color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 16px; }
    .highlight-box { background: #f0f7ff; border-left: 4px solid ${BRAND_COLOR}; border-radius: 6px; padding: 16px 20px; margin: 20px 0; }
    .highlight-box p { margin: 0; color: #1e3a5f; font-weight: 500; }
    .cta-btn { display: inline-block; background: ${ACCENT_COLOR}; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; margin: 24px 0; }
    .footer { background: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb; }
    .footer p { color: #9ca3af; font-size: 12px; margin: 0; }
    .status-badge { display: inline-block; background: #dcfce7; color: #166534; padding: 4px 12px; border-radius: 99px; font-size: 13px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>TechBes</h1>
      <p>Enterprise Service Platform</p>
    </div>
    <div class="body">
      ${getBodyContent(type, bodyText, data)}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} TechBes. All rights reserved.</p>
      <p style="margin-top:8px;">This is an automated notification. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

function getBodyContent(type, bodyText, data) {
  switch (type) {
    case 'booking_confirmed':
      return `
        <p>Dear <strong>${data.customerName || 'Customer'}</strong>,</p>
        <p>Your booking has been <span class="status-badge">✓ Confirmed</span></p>
        <div class="highlight-box">
          <p>📋 Service: ${data.serviceName || 'Service'}</p>
          <p>📅 Date: ${data.date || 'TBD'} at ${data.timeSlot || 'TBD'}</p>
          <p>📍 Address: ${data.address || 'N/A'}</p>
          <p>🔖 Reference: #${data.bookingId || 'N/A'}</p>
        </div>
        <p>Our team will assign a technician shortly. You will receive another notification once assigned.</p>
      `;

    case 'technician_assigned':
      return `
        <p>Dear <strong>${data.customerName || 'Customer'}</strong>,</p>
        <p>A technician has been assigned to your service request.</p>
        <div class="highlight-box">
          <p>👨‍🔧 Technician: <strong>${data.technicianName || 'TBD'}</strong></p>
          <p>⏱ ETA: ${data.eta || 'Will contact you shortly'}</p>
          <p>📞 Contact: ${data.technicianPhone || 'Via app'}</p>
        </div>
        <p>You can track your technician's live location in the TechBes app.</p>
      `;

    case 'payment_request':
      return `
        <p>Dear <strong>${data.customerName || 'Customer'}</strong>,</p>
        <p>Your service has been completed! Please complete the payment to close the request.</p>
        <div class="highlight-box">
          <p>💰 Amount Due: <strong>₹${data.amount || 0}</strong></p>
          <p>🔖 Job Reference: #${data.jobId || 'N/A'}</p>
        </div>
        ${data.paymentLink ? `<a href="${data.paymentLink}" class="cta-btn">Pay Now →</a>` : ''}
        <p>Thank you for choosing TechBes!</p>
      `;

    case 'job_completed':
      return `
        <p>Dear <strong>${data.customerName || 'Customer'}</strong>,</p>
        <p>Your service request has been <span class="status-badge">✓ Completed</span></p>
        <p>Thank you for choosing TechBes. We hope our technician provided excellent service.</p>
        <p>Please leave a review in the app to help us improve.</p>
      `;

    default:
      return `<p>${bodyText}</p>`;
  }
}

module.exports = { getEmailTemplate };
