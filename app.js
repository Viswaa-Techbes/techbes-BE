const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const managerRoutes = require('./routes/managerRoutes');
const technicianRoutes = require('./routes/technicianRoutes');
const jobRoutes = require('./routes/jobRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const leadRoutes = require('./routes/leadRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');

// V2 Routes
const jobRoutesV2 = require('./routes/v2/jobRoutesV2');
const paymentRoutesV2 = require('./routes/v2/paymentRoutesV2');
const attendanceRoutesV2 = require('./routes/v2/attendanceRoutesV2');
const notificationRoutesV2 = require('./routes/v2/notificationRoutesV2');
const bookingRoutesV2 = require('./routes/v2/bookingRoutesV2');
const kycRoutesV2 = require('./routes/v2/kycRoutesV2');
const customerRoutesV2 = require('./routes/v2/customerRoutesV2');
const cctvRoutesV2 = require('./routes/v2/cctvRoutesV2');
const aiRoutesV2 = require('./routes/v2/aiRoutesV2');
const materialRoutesV2 = require('./routes/v2/materialRoutesV2');
const leadRoutesV2 = require('./routes/v2/leadRoutesV2');
const locationRoutesV2 = require('./routes/v2/locationRoutesV2');
const adminRoutesV2 = require('./routes/v2/adminRoutesV2');
const userRoutesV2 = require('./routes/v2/userRoutesV2');
const uploadRoutesV2 = require('./routes/v2/uploadRoutesV2');
const analyticsRoutesV2 = require('./routes/v2/analyticsRoutesV2');
// visitor analytics legacy routes are still required for compatibility but
// have been disabled. Keep the import to avoid module resolution errors.
const visitorAnalyticsRoutesV2 = require('./routes/v2/visitorAnalyticsRoutesV2');
const careerRoutesV2 = require('./routes/v2/careerRoutesV2');
const courseRoutesV2 = require('./routes/v2/courseRoutesV2');
const admissionRoutesV2 = require('./routes/v2/admissionRoutesV2');
const cartRoutesV2 = require('./routes/v2/cartRoutesV2');
const dispatchRoutesV2 = require('./routes/v2/dispatchRoutesV2');
const cancellationRoutesV2 = require('./routes/v2/cancellationRoutesV2');
const routingRoutesV2 = require('./routes/v2/routingRoutesV2');
const worksheetRoutesV2 = require('./routes/v2/worksheetRoutesV2');
const otpRoutesV2 = require('./routes/v2/otpRoutesV2');
const categoryRoutesV2 = require('./routes/v2/categoryRoutesV2');
const walletRoutesV2 = require('./routes/v2/walletRoutesV2');

const errorHandler = require('./middlewares/errorHandler');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Explicitly add all production frontend domains
const productionDomains = [
  'https://techbes.co.in',
  'https://www.techbes.co.in',
  'https://members.techbes.co.in',
  'https://admin.techbes.co.in',
  'https://skills.techbes.co.in'
];
productionDomains.forEach((domain) => {
  if (!allowedOrigins.includes(domain)) {
    allowedOrigins.push(domain);
  }
});

// Add default local dev ports if not present
if (!allowedOrigins.includes('http://localhost:3000')) {
  allowedOrigins.push('http://localhost:3000');
}
if (!allowedOrigins.includes('http://localhost:5173')) {
  allowedOrigins.push('http://localhost:5173');
}

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }
    
    // Check exact match
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Check wildcard *.vercel.app (e.g. preview deployments)
    const isVercelApp = /^https?:\/\/[a-zA-Z0-9-]+\.vercel\.app$/i.test(origin);
    if (isVercelApp) {
      return callback(null, true);
    }
    
    // Allow any local development origin (localhost, 127.0.0.1, or local IP on any port)
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/.test(origin);
    if (isLocal) {
      return callback(null, true);
    }
    
    // Check custom wildcard matching if allowedOrigins contains a wildcard pattern
    for (const pattern of allowedOrigins) {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '[a-zA-Z0-9-]+') + '$', 'i');
        if (regex.test(origin)) {
          return callback(null, true);
        }
      }
    }
    
    return callback(new Error('Not allowed by CORS: ' + origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
}));
// capture raw body for webhook signature verification
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API Running'
  });
});

app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/', authRoutes);
app.use('/admin', adminRoutes);
app.use('/managers', managerRoutes);
app.use('/manager', managerRoutes); // Alias
app.use('/technicians', technicianRoutes);
app.use('/technician', technicianRoutes); // Alias
app.use('/jobs', jobRoutes);
app.use('/expenses', expenseRoutes);
app.use('/reviews', reviewRoutes);
app.use('/notifications', notificationRoutes);
app.use('/leads', leadRoutes);
app.use('/', paymentRoutes);
app.use('/attendance', attendanceRoutes);

// V2 APIs
app.use('/api/v2/auth', authRoutes);
app.use('/api/v2/services', cctvRoutesV2);
app.use('/api/v2/jobs', jobRoutesV2);
app.use('/api/v2/payment', paymentRoutesV2);
app.use('/api/v2/attendance', attendanceRoutesV2);
app.use('/api/v2/notifications', notificationRoutesV2);
app.use('/api/v2/bookings', bookingRoutesV2);
app.use('/api/v2/cctv', cctvRoutesV2);
app.use('/api/v2/materials', materialRoutesV2);
app.use('/api/v2/leads', leadRoutesV2);
app.use('/api/v2/cart', cartRoutesV2);
app.use('/api/v2/kyc', kycRoutesV2);
app.use('/api/v2/customer', customerRoutesV2);
app.use('/api/v2/wallet', walletRoutesV2);
app.use('/api/v2/ai', aiRoutesV2);

// Backwards-compatible API aliases used by frontends
app.use('/api/bookings', bookingRoutesV2);
app.use('/api/payments', paymentRoutesV2);
app.use('/api/v2/payments', paymentRoutesV2);
app.use('/api/v2/location', locationRoutesV2);
app.use('/api/v2/admin', adminRoutesV2);
app.use('/api/v2/user', userRoutesV2);
app.use('/api/user', userRoutesV2);
app.use('/api/dashboard', userRoutesV2);
app.use('/api/v2/upload', uploadRoutesV2);
app.use('/api/v2/analytics', analyticsRoutesV2);
// Keep legacy visitor analytics route registered (handlers return 410).
app.use('/api/v2/analytics/visitors', visitorAnalyticsRoutesV2);
app.use('/api/v2/careers', careerRoutesV2);
app.use('/api/v2', courseRoutesV2);
app.use('/api/v2/admission', admissionRoutesV2);

// ─── Phase 2: Dispatch & Cancellation ────────────────────────────────────────
app.use('/api/v2/dispatch', dispatchRoutesV2);
app.use('/api/v2/cancellations', cancellationRoutesV2);
app.use('/api/v2/routing', routingRoutesV2);
app.use('/api/v2/worksheets', worksheetRoutesV2);
app.use('/api/v2/otp', otpRoutesV2);
app.use('/api/v2/dispatch/otp', otpRoutesV2);
app.use('/api/v2/catalog', categoryRoutesV2);
app.use('/api/v2/kyc', kycRoutesV2);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

module.exports = app;
