/**
 * Production SMTP Diagnostic Script
 * Usage: node scripts/checkSmtpDiagnostic.js
 * 
 * Safely tests DNS, TCP socket connectivity, and Nodemailer authentication
 * on ports 587 and 465. Never prints passwords or credentials.
 */
require('dotenv').config();
const dns = require('dns');
const net = require('net');
const tls = require('tls');
const nodemailer = require('nodemailer');

const host = process.env.SMTP_HOST || 'smtp.gmail.com';
const configuredPort = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

console.log('====================================================');
console.log('      TECHBES PRODUCTION SMTP DIAGNOSTIC SUITE      ');
console.log('====================================================\n');

// 1. Environment Check
console.log('[1] ENVIRONMENT CONFIGURATION:');
console.log(` - SMTP_HOST : ${host}`);
console.log(` - SMTP_PORT : ${configuredPort}`);
console.log(` - SMTP_USER : ${user ? (user.slice(0, 3) + '***@' + (user.split('@')[1] || 'domain')) : 'MISSING'}`);
console.log(` - SMTP_PASS : ${pass ? '[CONFIGURED - 16 chars hidden]' : 'MISSING'}`);
if (!user || !pass) {
  console.error('\n❌ ERROR: SMTP credentials missing in .env!');
  process.exit(1);
}

// Helper: Test TCP Socket
function testTcpSocket(targetHost, targetPort, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = 'PENDING';

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      status = 'PASS';
      socket.destroy();
      resolve({ success: true, message: `Connected to ${targetHost}:${targetPort} successfully` });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ success: false, message: `Connection timed out after ${timeoutMs}ms (likely firewalled)` });
    });

    socket.on('error', (err) => {
      socket.destroy();
      resolve({ success: false, message: err.message });
    });

    socket.connect(targetPort, targetHost);
  });
}

async function runDiagnostics() {
  // 2. DNS Resolution
  console.log('\n[2] DNS RESOLUTION:');
  let ipv4Addresses = [];
  try {
    ipv4Addresses = await dns.promises.resolve4(host);
    console.log(` ✅ IPv4 (${host}) -> ${ipv4Addresses.join(', ')}`);
  } catch (err) {
    console.log(` ❌ IPv4 DNS Lookup Failed: ${err.message}`);
  }

  try {
    const ipv6Addresses = await dns.promises.resolve6(host);
    console.log(` ⚠️ IPv6 (${host}) -> ${ipv6Addresses.join(', ')} (Must be ignored if no IPv6 route)`);
  } catch (err) {
    console.log(` ℹ️ IPv6 DNS Lookup: None / ${err.code || err.message}`);
  }

  const targetIp = ipv4Addresses.length > 0 ? ipv4Addresses[0] : host;

  // 3. TCP Socket Connectivity
  console.log('\n[3] RAW TCP CONNECTIVITY (Outbound Firewall Test):');
  
  console.log(` - Testing Port 587 (IPv4: ${targetIp})...`);
  const tcp587 = await testTcpSocket(targetIp, 587, 6000);
  console.log(`   ${tcp587.success ? '✅ PASS' : '❌ FAIL'}: ${tcp587.message}`);

  console.log(` - Testing Port 465 (IPv4: ${targetIp})...`);
  const tcp465 = await testTcpSocket(targetIp, 465, 6000);
  console.log(`   ${tcp465.success ? '✅ PASS' : '❌ FAIL'}: ${tcp465.message}`);

  // 4. Nodemailer Transporter Test
  console.log('\n[4] NODEMAILER AUTHENTICATION & HANDSHAKE:');

  // Test port 587 if open
  console.log(' - Testing Port 587 (STARTTLS + IPv4)...');
  const t587 = nodemailer.createTransport({
    host,
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user, pass },
    family: 4,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    tls: { servername: host },
  });

  try {
    await t587.verify();
    console.log('   ✅ Port 587: VERIFIED & READY TO DELIVER');
  } catch (err) {
    console.log(`   ❌ Port 587 Failed: ${err.message}`);
  }

  // Test port 465 if open
  console.log(' - Testing Port 465 (Direct SSL + IPv4)...');
  const t465 = nodemailer.createTransport({
    host,
    port: 465,
    secure: true,
    auth: { user, pass },
    family: 4,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    tls: { servername: host },
  });

  try {
    await t465.verify();
    console.log('   ✅ Port 465: VERIFIED & READY TO DELIVER');
  } catch (err) {
    console.log(`   ❌ Port 465 Failed: ${err.message}`);
  }

  console.log('\n====================================================');
  console.log('                 DIAGNOSTIC SUMMARY                 ');
  console.log('====================================================');
  console.log(`Port 587 Reachable : ${tcp587.success ? 'YES' : 'NO'}`);
  console.log(`Port 465 Reachable : ${tcp465.success ? 'YES' : 'NO'}`);
  if (!tcp587.success && !tcp465.success) {
    console.log('⚠️ CONCLUSION: Hosting provider / firewall is blocking BOTH outbound SMTP ports (587 & 465).');
    console.log('   Action required: Unblock ports in VPS security group or contact hosting provider support.');
  } else if (!tcp587.success && tcp465.success) {
    console.log('💡 CONCLUSION: Port 587 is blocked or timed out, but Port 465 is reachable!');
    console.log('   Action required: Set SMTP_PORT=465 and SMTP_SECURE=true in .env and restart PM2.');
  } else if (tcp587.success && !tcp465.success) {
    console.log('💡 CONCLUSION: Port 587 is reachable, but Port 465 is blocked.');
    console.log('   Action required: Set SMTP_PORT=587 and SMTP_SECURE=false in .env and restart PM2.');
  } else {
    console.log('🎉 CONCLUSION: Both ports are reachable over IPv4.');
  }
  console.log('====================================================\n');
}

runDiagnostics().catch(console.error);
