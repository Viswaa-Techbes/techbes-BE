/**
 * Techbes Marketplace — Category Seed Script
 * Run: node BE/scripts/seedCategories.js
 * 
 * Seeds all 8 categories and their subcategories into MongoDB.
 * Safe to re-run: uses upsert to avoid duplicates.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Category = require('../models/Category');
const SubCategory = require('../models/SubCategory');

const CATEGORIES = [
  {
    name: 'CCTV',
    slug: 'cctv',
    description: 'Smart surveillance, remote monitoring, and security camera solutions.',
    icon: 'Camera',
    color: '#0EA5E9',
    gradient: 'from-cyan-500 via-sky-500 to-blue-600',
    sortOrder: 1,
    subcategories: [
      {
        name: 'Install New CCTV',
        slug: 'install-new-cctv',
        description: 'Fresh CCTV camera installation for homes and offices.',
        sortOrder: 1,
        bookingQuestions: [
          { question: "Select Property Type", type: "select", options: ["Home", "Office", "Shop", "Apartment", "Warehouse", "Factory", "Other"], required: true, placeholder: "Select property type...", sortOrder: 1 },
          { question: "How many Cameras", type: "select", options: ["2", "4", "6", "8", "16+", "Custom"], required: true, placeholder: "Select number of cameras...", sortOrder: 2 },
          { question: "Installation Package", type: "select", options: ["Basic", "Premium", "Custom"], required: true, placeholder: "Select package type...", sortOrder: 3 }
        ],
        packages: [
          { name: "Basic Setup", description: "Standard 1080p cameras, basic mounting and wiring", price: 1500, originalPrice: 2499, duration: "3-5 hours", includes: ["1080p camera setup", "Standard cable routing", "1-year installation warranty"], isPopular: true, isActive: true },
          { name: "Premium Setup", description: "4K UHD cameras, smart AI detection, structured conduit routing", price: 3500, originalPrice: 5999, duration: "4-6 hours", includes: ["4K UHD camera setup", "Conduit cable protection", "2-year warranty", "Mobile app setup"], isPopular: false, isActive: true },
          { name: "Custom Setup", description: "Design a customized setup matching complex site layouts", price: 0, originalPrice: 0, duration: "Flexible", includes: ["On-site planning", "Custom quotes", "Dedicated project manager"], isPopular: false, isActive: true }
        ]
      },
      {
        name: 'Repair Existing CCTV',
        slug: 'repair-existing-cctv',
        description: 'Diagnose and repair video loss, DVR/NVR errors, and power faults.',
        sortOrder: 2,
        bookingQuestions: [
          { question: "What's the Issue?", type: "multiselect", options: ["Camera Not Working", "DVR Issue", "NVR Issue", "Mobile View", "Recording Problem", "Poor Video", "No Power", "Others"], required: true, placeholder: "Select all that apply", sortOrder: 1 },
          { question: "Number of Cameras", type: "select", options: ["1", "2-4", "5-8", "8+"], required: true, placeholder: "Select number of faulty cameras...", sortOrder: 2 },
          { question: "Upload Image / Video", type: "image", required: false, placeholder: "Upload clear picture of fault (optional)", sortOrder: 3 }
        ],
        packages: [
          { name: "CCTV Diagnosis & Repair", description: "Comprehensive on-site troubleshooting and component fixing", price: 499, originalPrice: 899, duration: "1-2 hours", includes: ["Diagnosis of camera/DVR/NVR faults", "Connector crimping and checking", "Power supply check"], isPopular: true, isActive: true }
        ]
      },
      {
        name: 'Maintenance (AMC)',
        slug: 'maintenance-amc',
        description: 'Annual Maintenance Contracts for continuous, uninterrupted security coverage.',
        sortOrder: 3,
        bookingQuestions: [
          { question: "Choose AMC Plan", type: "select", options: ["One Time", "Quarterly", "Half Yearly", "Annual"], required: true, placeholder: "Select billing frequency...", sortOrder: 1 },
          { question: "Property Type", type: "select", options: ["Home", "Office", "Shop", "Apartment", "Warehouse", "Factory", "Other"], required: true, placeholder: "Select property type...", sortOrder: 2 }
        ],
        packages: [
          { name: "One Time Support", description: "Single-visit preemptive cleanup, camera alignment, and HDD health check", price: 999, originalPrice: 1499, duration: "2-3 hours", includes: ["Camera lens cleaning", "Connectors inspection", "DVR/NVR dust blower cleaning"], isPopular: false, isActive: true },
          { name: "Quarterly AMC", description: "Preventative checks every 3 months + priority support", price: 2499, originalPrice: 3999, duration: "Yearly coverage", includes: ["4 scheduled checks/year", "Unlimited breakdown calls", "No visit charges"], isPopular: false, isActive: true },
          { name: "Half Yearly AMC", description: "Preventative checks every 6 months + priority support", price: 4499, originalPrice: 6999, duration: "Yearly coverage", includes: ["2 scheduled checks/year", "Priority ticket status"], isPopular: false, isActive: true },
          { name: "Annual AMC", description: "Full year of premium maintenance, checks, and remote assistance", price: 7999, originalPrice: 11999, duration: "Yearly coverage", includes: ["Monthly checkups", "Free spares replacement (basic)", "24/7 priority support"], isPopular: true, isActive: true }
        ]
      },
      {
        name: 'Upgrade Existing CCTV',
        slug: 'upgrade-existing-cctv',
        description: 'Expand your coverage, upgrade to IP cameras, or increase storage capacities.',
        sortOrder: 4,
        bookingQuestions: [
          { question: "Upgrade Requirement", type: "multiselect", options: ["Add Cameras", "Replace DVR", "Upgrade DVR", "Upgrade NVR", "Increase Storage", "Complete Upgrade"], required: true, placeholder: "Select all upgrade goals", sortOrder: 1 }
        ],
        packages: [
          { name: "CCTV Upgrade Consultation", description: "Technician inspects existing wiring and recommends upgrade options", price: 499, originalPrice: 999, duration: "1-2 hours", includes: ["Existing setup compatibility check", "Custom upgrade roadmap", "Visit charges included"], isPopular: true, isActive: true }
        ]
      },
      {
        name: 'Buy CCTV Products',
        slug: 'buy-cctv-products',
        description: 'Purchase individual security security cameras, recorders, or cables.',
        sortOrder: 5,
        bookingQuestions: [
          { question: "Product Category", type: "select", options: ["Camera", "DVR", "NVR", "Hard Disk", "Cable", "Connector", "Power Supply", "Accessories", "Complete CCTV Kit"], required: true, placeholder: "Select product type...", sortOrder: 1 }
        ],
        packages: [
          { name: "Product Delivery & Demonstration", description: "Deliver products directly to your doorstep and show basic demo", price: 199, originalPrice: 399, duration: "1 hour", includes: ["Safe delivery", "Product inspection", "Basic settings overview"], isPopular: true, isActive: true }
        ]
      },
      {
        name: 'Free Site Survey',
        slug: 'free-site-survey',
        description: 'Schedule a free on-site survey for custom security planning and estimation.',
        sortOrder: 6,
        bookingQuestions: [
          { question: "Property Type", type: "select", options: ["Home", "Office", "Shop", "Apartment", "Warehouse", "Factory", "Other"], required: true, placeholder: "Select property type...", sortOrder: 1 },
          { question: "Survey Purpose", type: "select", options: ["New Installation", "Repair", "Upgrade", "AMC"], required: true, placeholder: "Select survey purpose...", sortOrder: 2 }
        ],
        packages: [
          { name: "Free Site Survey", description: "Get a certified engineer to draft a customized layout diagram and quotation", price: 0, originalPrice: 499, duration: "1-2 hours", includes: ["On-site camera placement planning", "Structured cabling path layout", "Detailed estimate sheet"], isPopular: true, isActive: true }
        ]
      }
    ],
  },
  {
    name: 'Networking',
    slug: 'networking',
    description: 'Wi-Fi, structured cabling, routers, and enterprise network rollout.',
    icon: 'Network',
    color: '#10B981',
    gradient: 'from-emerald-500 via-teal-500 to-cyan-600',
    sortOrder: 2,
    subcategories: [
      { name: 'Wi-Fi Network Setup', slug: 'wifi-setup', description: 'Home and office Wi-Fi router and mesh network setup.', sortOrder: 1 },
      { name: 'Structured Cabling', slug: 'structured-cabling', description: 'Cat5e / Cat6 / Cat6A structured cabling and patching.', sortOrder: 2 },
      { name: 'Network Troubleshooting', slug: 'network-troubleshooting', description: 'Diagnose and fix slow internet, dead zones, and connectivity issues.', sortOrder: 3 },
      { name: 'Firewall Setup', slug: 'firewall-setup', description: 'Hardware and software firewall installation and configuration.', sortOrder: 4 },
      { name: 'Network Switch Configuration', slug: 'switch-config', description: 'Managed and unmanaged switch setup for office networks.', sortOrder: 5 },
      { name: 'VPN Setup', slug: 'vpn-setup', description: 'Secure VPN configuration for remote work.', sortOrder: 6 },
      { name: 'Rack & Server Room Setup', slug: 'rack-setup', description: 'Professional rack installation and cable management.', sortOrder: 7 },
      { name: 'Network Audit', slug: 'network-audit', description: 'End-to-end network performance and security audit.', sortOrder: 8 },
      { name: 'Leased Line Setup', slug: 'leased-line', description: 'Dedicated leased line termination and router setup.', sortOrder: 9 },
      { name: 'Wireless Access Point', slug: 'access-point', description: 'Enterprise-grade access point installation.', sortOrder: 10 },
      { name: 'Network AMC', slug: 'network-amc', description: 'Annual maintenance contract for network infrastructure.', sortOrder: 11 },
      { name: 'VLAN Configuration', slug: 'vlan-config', description: 'Network segmentation with VLAN setup.', sortOrder: 12 },
    ],
  },
  {
    name: 'Laptop',
    slug: 'laptop',
    description: 'Laptop sales, repair, upgrade, and data recovery.',
    icon: 'Laptop',
    color: '#8B5CF6',
    gradient: 'from-violet-500 via-purple-500 to-indigo-600',
    sortOrder: 3,
    subcategories: [
      { name: 'Laptop Repair', slug: 'laptop-repair', description: 'Hardware and software repair for all laptop brands.', sortOrder: 1 },
      { name: 'Screen Replacement', slug: 'laptop-screen', description: 'Laptop display / screen replacement service.', sortOrder: 2 },
      { name: 'Battery Replacement', slug: 'laptop-battery', description: 'Genuine laptop battery replacement.', sortOrder: 3 },
      { name: 'RAM Upgrade', slug: 'laptop-ram', description: 'Laptop RAM upgrade for better performance.', sortOrder: 4 },
      { name: 'SSD/HDD Upgrade', slug: 'laptop-storage', description: 'Storage upgrade with SSD or HDD replacement.', sortOrder: 5 },
      { name: 'OS Installation', slug: 'laptop-os', description: 'Windows / Linux OS installation and drivers.', sortOrder: 6 },
      { name: 'Data Recovery', slug: 'laptop-data-recovery', description: 'Recover lost or corrupted data from laptop drives.', sortOrder: 7 },
      { name: 'Laptop Cleaning', slug: 'laptop-cleaning', description: 'Deep cleaning, thermal paste replacement, and fan cleaning.', sortOrder: 8 },
      { name: 'Keyboard Replacement', slug: 'laptop-keyboard', description: 'Laptop keyboard repair and full replacement.', sortOrder: 9 },
      { name: 'Laptop Sales', slug: 'laptop-sales', description: 'New and refurbished laptop sales with warranty.', sortOrder: 10 },
    ],
  },
  {
    name: 'Desktop',
    slug: 'desktop',
    description: 'Desktop computer sales, repair, assembly, and upgrades.',
    icon: 'Monitor',
    color: '#F59E0B',
    gradient: 'from-amber-500 via-orange-500 to-red-500',
    sortOrder: 4,
    subcategories: [
      { name: 'Desktop Repair', slug: 'desktop-repair', description: 'Hardware and software repair for desktop PCs.', sortOrder: 1 },
      { name: 'Custom PC Build', slug: 'custom-pc-build', description: 'Assemble and configure a custom desktop.', sortOrder: 2 },
      { name: 'Desktop RAM Upgrade', slug: 'desktop-ram', description: 'RAM upgrade for improved desktop performance.', sortOrder: 3 },
      { name: 'Desktop SSD/HDD', slug: 'desktop-storage', description: 'Desktop storage upgrade with SSD or HDD.', sortOrder: 4 },
      { name: 'Graphics Card Install', slug: 'gpu-install', description: 'Install or upgrade graphics card.', sortOrder: 5 },
      { name: 'Power Supply Replacement', slug: 'psu-replacement', description: 'PSU replacement and wattage upgrade.', sortOrder: 6 },
      { name: 'Motherboard Repair', slug: 'motherboard-repair', description: 'Motherboard diagnosis and replacement.', sortOrder: 7 },
      { name: 'Monitor Repair', slug: 'monitor-repair', description: 'Monitor display panel and component repair.', sortOrder: 8 },
      { name: 'OS Installation', slug: 'desktop-os', description: 'Windows / Linux OS installation for desktop.', sortOrder: 9 },
      { name: 'Virus Removal', slug: 'virus-removal', description: 'Malware detection and complete removal.', sortOrder: 10 },
      { name: 'Data Recovery', slug: 'desktop-data-recovery', description: 'Recover lost files from desktop hard drives.', sortOrder: 11 },
      { name: 'Desktop Networking', slug: 'desktop-networking', description: 'Connect desktop to wired or wireless network.', sortOrder: 12 },
      { name: 'Desktop Sales', slug: 'desktop-sales', description: 'New and refurbished desktop sales.', sortOrder: 13 },
    ],
  },
  {
    name: 'Server',
    slug: 'server',
    description: 'Server installation, maintenance, virtualisation, and cloud migration.',
    icon: 'Server',
    color: '#6366F1',
    gradient: 'from-indigo-500 via-blue-600 to-violet-600',
    sortOrder: 5,
    subcategories: [
      { name: 'Server Installation', slug: 'server-installation', description: 'Rack and tower server hardware installation.', sortOrder: 1 },
      { name: 'Server Configuration', slug: 'server-config', description: 'Server OS and software configuration.', sortOrder: 2 },
      { name: 'NAS Setup', slug: 'nas-setup', description: 'Network Attached Storage setup and configuration.', sortOrder: 3 },
      { name: 'Virtualisation', slug: 'virtualisation', description: 'VMware / Hyper-V / Proxmox virtualisation setup.', sortOrder: 4 },
      { name: 'Backup & Recovery', slug: 'server-backup', description: 'Automated backup and disaster recovery setup.', sortOrder: 5 },
      { name: 'Server Migration', slug: 'server-migration', description: 'Physical to virtual or cloud server migration.', sortOrder: 6 },
      { name: 'Server AMC', slug: 'server-amc', description: 'Annual maintenance contract for servers.', sortOrder: 7 },
      { name: 'Active Directory', slug: 'active-directory', description: 'Windows Active Directory setup and management.', sortOrder: 8 },
      { name: 'Email Server Setup', slug: 'email-server', description: 'On-premises email server installation.', sortOrder: 9 },
      { name: 'Linux Server Admin', slug: 'linux-server', description: 'Linux server administration and hardening.', sortOrder: 10 },
      { name: 'Web Server Setup', slug: 'web-server', description: 'Apache / Nginx / IIS web server configuration.', sortOrder: 11 },
      { name: 'Database Server', slug: 'db-server', description: 'MySQL / MSSQL / PostgreSQL server setup.', sortOrder: 12 },
      { name: 'Server Security Audit', slug: 'server-security', description: 'Full security assessment and patch management.', sortOrder: 13 },
      { name: 'Server Upgrade', slug: 'server-upgrade', description: 'RAM, storage, and component upgrades.', sortOrder: 14 },
      { name: 'Cloud Server Setup', slug: 'cloud-server', description: 'AWS / Azure / GCP cloud server provisioning.', sortOrder: 15 },
    ],
  },
  {
    name: 'Website Development',
    slug: 'website-development',
    description: 'Professional website design, development, e-commerce, and SEO.',
    icon: 'Globe',
    color: '#EC4899',
    gradient: 'from-pink-500 via-rose-500 to-red-500',
    sortOrder: 6,
    subcategories: [
      { name: 'Business Website', slug: 'business-website', description: 'Professional 5-10 page business website.', sortOrder: 1 },
      { name: 'E-Commerce Website', slug: 'ecommerce-website', description: 'Full-featured online store with payment gateway.', sortOrder: 2 },
      { name: 'Landing Page', slug: 'landing-page', description: 'High-converting single landing page design.', sortOrder: 3 },
      { name: 'Portfolio Website', slug: 'portfolio-website', description: 'Personal or business portfolio website.', sortOrder: 4 },
      { name: 'WordPress Development', slug: 'wordpress-dev', description: 'Custom WordPress theme and plugin development.', sortOrder: 5 },
      { name: 'React/Next.js Development', slug: 'react-nextjs', description: 'Modern React or Next.js web applications.', sortOrder: 6 },
      { name: 'Website Redesign', slug: 'website-redesign', description: 'Modernise your existing website.', sortOrder: 7 },
      { name: 'Website Maintenance', slug: 'website-maintenance', description: 'Monthly website updates and maintenance.', sortOrder: 8 },
      { name: 'Domain & Hosting Setup', slug: 'domain-hosting', description: 'Domain registration, DNS, and hosting setup.', sortOrder: 9 },
      { name: 'SSL Certificate Setup', slug: 'ssl-setup', description: 'HTTPS setup with SSL/TLS certificate.', sortOrder: 10 },
      { name: 'SEO Optimisation', slug: 'seo', description: 'On-page and technical SEO optimisation.', sortOrder: 11 },
      { name: 'Google Workspace Setup', slug: 'google-workspace', description: 'Gmail, Drive, Meet for business setup.', sortOrder: 12 },
      { name: 'WhatsApp Business API', slug: 'whatsapp-api', description: 'WhatsApp Business API integration.', sortOrder: 13 },
      { name: 'CRM Integration', slug: 'crm-integration', description: 'Integrate CRM tools like Zoho, HubSpot.', sortOrder: 14 },
      { name: 'Payment Gateway Integration', slug: 'payment-gateway', description: 'Razorpay / Stripe / PayU integration.', sortOrder: 15 },
      { name: 'Website Speed Optimisation', slug: 'website-speed', description: 'Core Web Vitals and page speed optimisation.', sortOrder: 16 },
    ],
  },
  {
    name: 'Home Automation',
    slug: 'home-automation',
    description: 'Smart home systems, automation, and IoT device setup.',
    icon: 'Home',
    color: '#14B8A6',
    gradient: 'from-teal-500 via-cyan-500 to-sky-600',
    sortOrder: 7,
    subcategories: [
      { name: 'Smart Switch Installation', slug: 'smart-switch', description: 'Install smart light switches and dimmers.', sortOrder: 1 },
      { name: 'Smart Lighting', slug: 'smart-lighting', description: 'Philips Hue, Syska, and other smart bulb setup.', sortOrder: 2 },
      { name: 'Video Doorbell', slug: 'video-doorbell', description: 'Ring / Hikvision video doorbell installation.', sortOrder: 3 },
      { name: 'Smart Lock Installation', slug: 'smart-lock', description: 'Biometric and smart door lock setup.', sortOrder: 4 },
      { name: 'Smart AC Control', slug: 'smart-ac', description: 'IR blaster and smart thermostat for AC control.', sortOrder: 5 },
      { name: 'Home Theater Setup', slug: 'home-theater', description: 'Projector, speaker, and AV receiver installation.', sortOrder: 6 },
      { name: 'Voice Assistant Setup', slug: 'voice-assistant', description: 'Amazon Alexa / Google Home configuration.', sortOrder: 7 },
      { name: 'Smart TV Setup', slug: 'smart-tv', description: 'Smart TV configuration and streaming app setup.', sortOrder: 8 },
      { name: 'Smart Sensor Installation', slug: 'smart-sensor', description: 'Motion, smoke, water, and temperature sensors.', sortOrder: 9 },
      { name: 'Home Network for IoT', slug: 'iot-network', description: 'Dedicated network for smart home devices.', sortOrder: 10 },
      { name: 'Solar & Energy Monitoring', slug: 'energy-monitor', description: 'Smart plug and energy monitoring setup.', sortOrder: 11 },
      { name: 'IP Intercom System', slug: 'ip-intercom', description: 'Multi-apartment IP video intercom installation.', sortOrder: 12 },
      { name: 'Automation Programming', slug: 'automation-scenes', description: 'Custom automation scenes and schedules.', sortOrder: 13 },
      { name: 'Smart Curtain / Blind', slug: 'smart-curtain', description: 'Motorised smart curtain and blind installation.', sortOrder: 14 },
      { name: 'EV Charger Installation', slug: 'ev-charger', description: 'Home EV charging point installation.', sortOrder: 15 },
      { name: 'Security Alarm System', slug: 'security-alarm', description: 'Intrusion detection and alarm system setup.', sortOrder: 16 },
      { name: 'Home Automation Consultation', slug: 'automation-consultation', description: 'Professional smart home planning consultation.', sortOrder: 17 },
    ],
  },
  {
    name: 'Electrical Contract',
    slug: 'electrical-contract',
    description: 'Electrical wiring, panel upgrades, and maintenance contracts.',
    icon: 'Zap',
    color: '#F97316',
    gradient: 'from-orange-500 via-amber-500 to-yellow-500',
    sortOrder: 8,
    subcategories: [
      { name: 'Home Wiring', slug: 'home-wiring', description: 'Complete home electrical wiring and rewiring.', sortOrder: 1 },
      { name: 'Office Wiring', slug: 'office-wiring', description: 'Commercial office electrical wiring and layout.', sortOrder: 2 },
      { name: 'DB Panel Upgrade', slug: 'db-panel', description: 'Distribution board installation and upgrade.', sortOrder: 3 },
      { name: 'MCB / RCCB Installation', slug: 'mcb-rccb', description: 'MCB, RCCB, and isolator installation.', sortOrder: 4 },
      { name: 'Earthing & Grounding', slug: 'earthing', description: 'Proper earthing and grounding system setup.', sortOrder: 5 },
      { name: 'Inverter / UPS Setup', slug: 'inverter-ups', description: 'Inverter and UPS installation for power backup.', sortOrder: 6 },
      { name: 'Generator Setup', slug: 'generator', description: 'Diesel / petrol generator installation and maintenance.', sortOrder: 7 },
      { name: 'Electrical Audit', slug: 'electrical-audit', description: 'Full electrical safety audit and inspection.', sortOrder: 8 },
      { name: 'Light & Fan Installation', slug: 'light-fan', description: 'Ceiling fan, lights, and fixture installation.', sortOrder: 9 },
      { name: 'AC Power Point', slug: 'ac-power', description: 'Dedicated power point installation for ACs.', sortOrder: 10 },
      { name: 'Industrial Wiring', slug: 'industrial-wiring', description: 'Heavy-duty industrial electrical work.', sortOrder: 11 },
      { name: 'Fire Alarm Wiring', slug: 'fire-alarm-wiring', description: 'Fire alarm panel and detector wiring.', sortOrder: 12 },
      { name: 'Solar Panel Wiring', slug: 'solar-wiring', description: 'Solar panel installation and grid tie-up.', sortOrder: 13 },
      { name: 'Electrical AMC', slug: 'electrical-amc', description: 'Annual maintenance contract for electrical systems.', sortOrder: 14 },
    ],
  },
];

async function seed() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('❌  MONGODB_URI not set. Add it to your .env file.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('✅  Connected to MongoDB');

  let catCount = 0;
  let subCount = 0;

  for (const catData of CATEGORIES) {
    const { subcategories, ...catFields } = catData;

    // Upsert category
    const category = await Category.findOneAndUpdate(
      { slug: catFields.slug },
      { $set: catFields },
      { upsert: true, new: true, runValidators: true }
    );
    catCount++;
    console.log(`  📁 Category: ${category.name}`);

    if (catFields.slug === 'cctv') {
      await SubCategory.deleteMany({ categoryId: category._id });
    }

    // Upsert subcategories
    for (const subData of subcategories) {
      await SubCategory.findOneAndUpdate(
        { slug: subData.slug },
        { $set: { ...subData, categoryId: category._id } },
        { upsert: true, new: true, runValidators: true }
      );
      subCount++;
      console.log(`    └─ SubCategory: ${subData.name}`);
    }
  }

  console.log(`\n✅  Seed complete! ${catCount} categories, ${subCount} subcategories.`);
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌  Seed failed:', err);
  process.exit(1);
});
