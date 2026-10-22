const fs = require('fs');
const path = require('path');

const rootDir = 'c:/Work/technician_app';
const beRoutesDir = path.join(rootDir, 'BE', 'routes');
const v2Dir = path.join(beRoutesDir, 'v2');

// Map of route file to mount prefix in app.js
const appMounts = {
  // V1 mounts
  'authRoutes.js': ['/auth', '/api/auth', '/', '/api/v2/auth'],
  'adminRoutes.js': ['/admin'],
  'managerRoutes.js': ['/managers', '/manager'],
  'technicianRoutes.js': ['/technicians', '/technician'],
  'jobRoutes.js': ['/jobs'],
  'expenseRoutes.js': ['/expenses'],
  'reviewRoutes.js': ['/reviews'],
  'notificationRoutes.js': ['/notifications'],
  'leadRoutes.js': ['/leads'],
  'paymentRoutes.js': ['/'],
  'attendanceRoutes.js': ['/attendance'],

  // V2 mounts
  'cctvRoutesV2.js': ['/api/v2/services', '/api/v2/cctv'],
  'jobRoutesV2.js': ['/api/v2/jobs'],
  'paymentRoutesV2.js': ['/api/v2/payment', '/api/payments', '/api/v2/payments'],
  'attendanceRoutesV2.js': ['/api/v2/attendance'],
  'notificationRoutesV2.js': ['/api/v2/notifications'],
  'bookingRoutesV2.js': ['/api/v2/bookings', '/api/bookings'],
  'materialRoutesV2.js': ['/api/v2/materials'],
  'leadRoutesV2.js': ['/api/v2/leads'],
  'cartRoutesV2.js': ['/api/v2/cart'],
  'kycRoutesV2.js': ['/api/v2/kyc'],
  'customerRoutesV2.js': ['/api/v2/customer'],
  'walletRoutesV2.js': ['/api/v2/wallet'],
  'aiRoutesV2.js': ['/api/v2/ai'],
  'amcRoutesV2.js': ['/api/v2/amc'],
  'quoteRoutesV2.js': ['/api/v2/quotes'],
  'inventoryRoutesV2.js': ['/api/v2/inventory'],
  'apartmentRoutesV2.js': ['/api/v2/apartments'],
  'locationRoutesV2.js': ['/api/v2/location'],
  'adminRoutesV2.js': ['/api/v2/admin'],
  'userRoutesV2.js': ['/api/v2/user', '/api/user', '/api/dashboard'],
  'uploadRoutesV2.js': ['/api/v2/upload'],
  'analyticsRoutesV2.js': ['/api/v2/analytics'],
  'visitorAnalyticsRoutesV2.js': ['/api/v2/analytics/visitors'],
  'careerRoutesV2.js': ['/api/v2/careers'],
  'courseRoutesV2.js': ['/api/v2'],
  'admissionRoutesV2.js': ['/api/v2/admission'],
  'dispatchRoutesV2.js': ['/api/v2/dispatch'],
  'cancellationRoutesV2.js': ['/api/v2/cancellations'],
  'routingRoutesV2.js': ['/api/v2/routing'],
  'worksheetRoutesV2.js': ['/api/v2/worksheets'],
  'otpRoutesV2.js': ['/api/v2/otp', '/api/v2/dispatch/otp'],
  'categoryRoutesV2.js': ['/api/v2/catalog'],
  'cctvCourseRoutesV2.js': ['/api/v2/cctv-course'],
};

function parseRoutesFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const filename = path.basename(filePath);
  const mounts = appMounts[filename] || [''];
  const routes = [];

  // Match router.METHOD(path, ...middlewares, handler)
  const routeRegex = /router\.(get|post|put|delete|patch)\(\s*(['"][^'"]+['"])/g;
  let match;
  while ((match = routeRegex.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const routeSubPath = match[2].replace(/['"]/g, '');

    // Find the full line or statement to extract middlewares and handler
    const startIndex = match.index;
    const nextLineIndex = content.indexOf('\n', startIndex);
    const lineSnippet = content.substring(startIndex, nextLineIndex > -1 ? nextLineIndex : startIndex + 150);

    // Look for auth middlewares in snippet or surrounding lines
    const isAuthRequired = lineSnippet.includes('authenticate') || lineSnippet.includes('authMiddleware') || lineSnippet.includes('verifyToken') || lineSnippet.includes('protect');
    const isRoleChecked = lineSnippet.includes('authorize') || lineSnippet.includes('checkRole') || lineSnippet.includes('adminOnly') || lineSnippet.includes('roleMiddleware');

    mounts.forEach(mountPrefix => {
      let fullPath = (mountPrefix + (routeSubPath === '/' ? '' : routeSubPath)).replace(/\/+/g, '/');
      if (fullPath === '') fullPath = '/';
      routes.push({
        method,
        subPath: routeSubPath,
        mountPrefix,
        fullPath,
        file: filename,
        isAuthRequired,
        isRoleChecked,
        snippet: lineSnippet.trim()
      });
    });
  }

  return routes;
}

const allRoutes = [];
const v1Files = fs.readdirSync(beRoutesDir).filter(f => f.endsWith('.js'));
v1Files.forEach(f => {
  allRoutes.push(...parseRoutesFromFile(path.join(beRoutesDir, f)));
});

const v2Files = fs.readdirSync(v2Dir).filter(f => f.endsWith('.js'));
v2Files.forEach(f => {
  allRoutes.push(...parseRoutesFromFile(path.join(v2Dir, f)));
});

// Remove duplicates based on method + fullPath
const uniqueRoutes = [];
const seen = new Set();
allRoutes.forEach(r => {
  const key = `${r.method} ${r.fullPath}`;
  if (!seen.has(key)) {
    seen.add(key);
    uniqueRoutes.push(r);
  }
});

console.log(`Total Route Declarations across all files: ${allRoutes.length}`);
console.log(`Unique Method + FullPath Endpoints: ${uniqueRoutes.length}`);

// Group by primary module
const byModule = {};
uniqueRoutes.forEach(r => {
  const mod = r.file;
  if (!byModule[mod]) byModule[mod] = [];
  byModule[mod].push(r);
});

console.log('\n--- Endpoints by Route File ---');
Object.keys(byModule).sort().forEach(mod => {
  console.log(`${mod}: ${byModule[mod].length} unique endpoints`);
});

fs.writeFileSync(
  path.join(rootDir, 'BE', 'scratch', 'api_inventory.json'),
  JSON.stringify({ totalUnique: uniqueRoutes.length, endpoints: uniqueRoutes }, null, 2)
);
console.log('\nWrote BE/scratch/api_inventory.json successfully');
