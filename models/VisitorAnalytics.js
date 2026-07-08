const mongoose = require('mongoose');

const visitorAnalyticsSchema = new mongoose.Schema(
  {
    domain: { type: String, trim: true, index: true },
    hostname: { type: String, trim: true, index: true },
    ip: { type: String, trim: true },
    country: { type: String, trim: true, default: 'Unknown' },
    state: { type: String, trim: true, default: 'Unknown' },
    city: { type: String, trim: true, default: 'Unknown' },
    browser: { type: String, trim: true, default: 'unknown' },
    device: { type: String, trim: true, default: 'unknown' },
    os: { type: String, trim: true, default: 'unknown' },
    page: { type: String, trim: true, default: '/' },
    eventType: {
      type: String,
      enum: ['page_view', 'service_viewed', 'booking_started', 'booking_completed', 'payment_completed', 'lead_submitted'],
      default: 'page_view',
      index: true,
    },
    sessionId: { type: String, trim: true, index: true },
    referral: { type: String, trim: true, default: '' },
    visitedAt: { type: Date, default: Date.now, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

visitorAnalyticsSchema.index({ domain: 1, visitedAt: -1 });
visitorAnalyticsSchema.index({ sessionId: 1, domain: 1 });
visitorAnalyticsSchema.index({ page: 1, visitedAt: -1 });
visitorAnalyticsSchema.index({ city: 1, visitedAt: -1 });
visitorAnalyticsSchema.index({ eventType: 1, visitedAt: -1 });

module.exports = mongoose.model('VisitorAnalytics', visitorAnalyticsSchema, 'visitorAnalytics');
