console.log("Starting server...");

const path = require('path');
const dns = require('dns');

// Helps some Windows / Node 17+ setups where IPv6-first DNS causes odd connection behaviour.
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

// Global Error Handlers for Stability on Render
process.on('uncaughtException', err => {
  console.error("CRITICAL: Uncaught Exception:", err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error("CRITICAL: Unhandled Rejection at:", promise, "reason:", reason);
});

// Load BE/.env
require('dotenv').config({
  path: path.join(__dirname, '.env')
});

const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const app = require('./app');

const PORT = process.env.PORT || 5000;
const startupEnv = {
  nodeEnv: process.env.NODE_ENV || 'production',
  port: PORT,
  hasMongoUri: Boolean(process.env.MONGODB_URI),
  hasJwtSecret: Boolean(process.env.JWT_SECRET),
  hasRazorpayKeyId: Boolean(process.env.RAZORPAY_KEY_ID),
  hasRazorpayKeySecret: Boolean(process.env.RAZORPAY_KEY_SECRET),
  frontendUrl: process.env.FRONTEND_URL || '',
};
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Store io in app AND global so services can access it without circular deps
app.set('io', io);
global._socketIo = io;

io.on('connection', (socket) => {
  console.log('[Socket] Client connected:', socket.id);

  // User joins their personal room (userId = MongoDB _id string)
  socket.on('join', (userId) => {
    if (!userId) return;
    socket.join(userId.toString());
    console.log(`[Socket] User ${userId} joined personal room`);
  });

  // Admin joins admin_room for dispatch monitor broadcasts
  socket.on('join_admin', () => {
    socket.join('admin_room');
    console.log(`[Socket] Admin joined admin_room (socket: ${socket.id})`);
  });

  // Technician updates location in real-time
  socket.on('update_location', (data) => {
    const { userId, lat, lng, name, availabilityStatus } = data;
    if (!userId || lat === undefined || lng === undefined) return;

    // Broadcast to admin_room (fleet tracking)
    io.to('admin_room').emit('technicianLocationUpdate', {
      technicianId: userId,
      lat,
      lng,
      name: name || 'Technician',
      isOnline: availabilityStatus === 'ONLINE',
      availabilityStatus: availabilityStatus || 'ONLINE',
      lastUpdate: new Date().toISOString(),
    });

    // Persist to DB asynchronously (non-blocking)
    setImmediate(async () => {
      try {
        const User = require('./models/User');
        await User.findByIdAndUpdate(userId, {
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          locationUpdatedAt: new Date(),
          ...(availabilityStatus ? { availabilityStatus } : {}),
        });
      } catch (err) {
        console.error('[Socket] Failed to update location in DB:', err.message);
      }
    });
  });

  // Technician updates availability
  socket.on('update_availability', async (data) => {
    const { userId, status } = data;
    if (!userId || !status) return;

    try {
      const User = require('./models/User');

      // Performance-based suspension check
      if (status === 'ONLINE') {
        const checkUser = await User.findById(userId).select('performanceScore penaltyPoints');
        if (checkUser) {
          const penaltyPoints = checkUser.penaltyPoints || 0;
          const performanceScore = checkUser.performanceScore !== undefined ? checkUser.performanceScore : 100;
          if (penaltyPoints >= 3 || performanceScore < 70) {
            console.warn(`[Socket] Suspended technician ${userId} prevented from going ONLINE`);
            socket.emit('availability_update_failed', {
              message: `Your account is temporarily suspended from going ONLINE due to repeated cancellations (${penaltyPoints} penalties) or low performance score (${performanceScore}%).`
            });
            return;
          }
        }
      }

      await User.findByIdAndUpdate(userId, {
        availabilityStatus: status,
        isOnline: status === 'ONLINE',
        ...(status === 'OFFLINE' ? { activeJobId: null } : {}),
      });

      io.to('admin_room').emit('technicianStatusUpdate', {
        technicianId: userId,
        availabilityStatus: status,
        isOnline: status === 'ONLINE',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Socket] Failed to update availability:', err.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Client disconnected:', socket.id);
  });
});


async function start() {
  try {
    console.log("[Startup] 1. Environment loaded and validated.");
    console.log("[Startup] 2. Configuration & Infrastructure initialized.");

    // 3. Connect to Database (Essential)
    console.log("[Startup] 3. Connecting to Database...");
    await connectDB();
    console.log("Database connected successfully.");
    
    // Trigger seeders only after database connection
    try {
      const seedCctvDataInternal = require('./scripts/seedCctvData_internal');
      await seedCctvDataInternal();
    } catch (seedErr) {
      console.error("CCTV seeding failed at startup:", seedErr);
    }

    try {
      const seedMasterclass = require('./scripts/seedMasterclass');
      await seedMasterclass();
    } catch (seedMcErr) {
      console.error("Masterclass seeding failed at startup:", seedMcErr);
    }

    // 4. Auxiliary Services (Fault-tolerant)
    try {
      console.log("[Startup] 4. Validating SMTP Email Configuration...");
      const { verifySmtpConfig } = require('./services/emailService');
      await verifySmtpConfig();
    } catch (err) {
      console.error('SMTP Validation Error during startup:', err.message || err);
    }

    // 5. Server Binding (Listen only when all dependencies are ready)
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`--------------------------------------------------`);
      console.log(`SERVER IS LIVE ON PORT ${PORT}`);
      console.log(`Environment: ${startupEnv.nodeEnv}`);
      console.log(`Binds to: 0.0.0.0:${PORT}`);
      console.log(`[Startup] Env readiness: ${JSON.stringify(startupEnv)}`);
      console.log(`--------------------------------------------------`);

      try {
        const { printMountedRoutes } = require('./utils/routePrinter');
        printMountedRoutes(app);
      } catch (routeErr) {
        console.error('Failed to print routes:', routeErr);
      }
    });

  } catch (err) {
    console.error('❌ CRITICAL STARTUP FAILURE:', err.message || err);
    process.exit(1);
  }
}

start();
