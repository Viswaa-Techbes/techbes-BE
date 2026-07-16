const Category = require('../models/Category');
const SubCategory = require('../models/SubCategory');

async function runSeed() {
  try {
    // Seed CCTV Products with Technical Variants
    const CctvProduct = require('../models/CctvProduct');
    const productsData = [
      {
        name: 'Camera',
        price: 1200,
        type: 'camera',
        variants: [
          { name: 'Dome Camera', price: 1200 },
          { name: 'Bullet Camera', price: 1400 },
          { name: 'PTZ Camera', price: 4800 },
          { name: 'IP Camera', price: 2000 },
          { name: 'Wireless Camera', price: 1800 }
        ],
        sortOrder: 1
      },
      {
        name: 'DVR',
        price: 2800,
        type: 'recorder',
        variants: [
          { name: '4 Channel DVR', price: 2800 },
          { name: '8 Channel DVR', price: 4500 },
          { name: '16 Channel DVR', price: 8500 }
        ],
        sortOrder: 2
      },
      {
        name: 'NVR',
        price: 4800,
        type: 'recorder',
        variants: [
          { name: '4 Channel NVR', price: 4800 },
          { name: '8 Channel NVR', price: 7500 },
          { name: '16 Channel NVR', price: 12000 }
        ],
        sortOrder: 3
      },
      {
        name: 'Hard Disk',
        price: 3800,
        type: 'storage',
        variants: [
          { name: '1 TB HDD', price: 3800 },
          { name: '2 TB HDD', price: 5500 },
          { name: '4 TB HDD', price: 8500 },
          { name: '8 TB HDD', price: 14000 }
        ],
        sortOrder: 4
      },
      {
        name: 'Cable',
        price: 1800,
        type: 'cable',
        variants: [
          { name: 'Coaxial Cable (per meter)', price: 35 },
          { name: 'Cat6 Cable (per meter)', price: 45 },
          { name: 'Cable Roll (90m)', price: 1800 }
        ],
        sortOrder: 5
      },
      {
        name: 'Connector',
        price: 150,
        type: 'accessory',
        variants: [
          { name: 'BNC Connector', price: 50 },
          { name: 'DC Pin', price: 30 },
          { name: 'RJ45 Connector', price: 20 },
          { name: 'Connector Kit', price: 150 }
        ],
        sortOrder: 6
      },
      {
        name: 'Power Supply',
        price: 650,
        type: 'power',
        variants: [
          { name: '4 Channel Power Supply', price: 650 },
          { name: '8 Channel Power Supply', price: 1200 },
          { name: 'SMPS', price: 650 }
        ],
        sortOrder: 7
      },
      {
        name: 'Accessories',
        price: 150,
        type: 'accessory',
        variants: [
          { name: 'Junction Box', price: 150 },
          { name: 'PVC Pipe (per meter)', price: 60 },
          { name: 'HDMI Cable (3m)', price: 450 }
        ],
        sortOrder: 8
      },
      {
        name: 'Complete CCTV Kit',
        price: 15000,
        type: 'product',
        variants: [
          { name: '4 Camera Setup Kit', price: 15000 },
          { name: '8 Camera Setup Kit', price: 28000 }
        ],
        sortOrder: 9
      }
    ];

    for (const p of productsData) {
      await CctvProduct.findOneAndUpdate(
        { slug: p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') },
        { $set: { ...p, slug: p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), status: 'active' } },
        { upsert: true, new: true }
      );
    }
    console.log("🌱 Auto-seeded CCTV Products and technical variants successfully!");

    // ─── CCTV Category & Subcategory Redesign Migration ────────────────────────
    let cctvCategory = await Category.findOne({ slug: 'cctv' });
    if (!cctvCategory) {
      cctvCategory = await Category.create({
        name: 'CCTV',
        slug: 'cctv',
        description: 'Smart surveillance, remote monitoring, and security camera solutions.',
        icon: 'Camera',
        color: '#0EA5E9',
        gradient: 'from-cyan-500 via-sky-500 to-blue-600',
        sortOrder: 1,
      });
    }

    const newSlugs = [
      'install-new-cctv',
      'repair-existing-cctv',
      'maintenance-amc',
      'upgrade-existing-cctv',
      'buy-cctv-products',
      'free-site-survey'
    ];

    // Check if new subcategories are present
    const existingCctvSubs = await SubCategory.find({ categoryId: cctvCategory._id });
    const existingSlugs = existingCctvSubs.map(s => s.slug);
    const needsMigration = newSlugs.some(slug => !existingSlugs.includes(slug)) || existingSlugs.some(slug => !newSlugs.includes(slug));

    if (needsMigration) {
      console.log("🔄 CCTV Category redesign migration triggered. Re-seeding CCTV subcategories...");
      
      // Delete old subcategories under CCTV
      await SubCategory.deleteMany({ categoryId: cctvCategory._id });

      const cctvSubcategories = [
        {
          name: 'Install New CCTV',
          slug: 'install-new-cctv',
          description: 'Fresh CCTV camera installation for homes and offices.',
          sortOrder: 1,
          categoryId: cctvCategory._id,
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
          categoryId: cctvCategory._id,
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
          categoryId: cctvCategory._id,
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
          categoryId: cctvCategory._id,
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
          description: 'Purchase individual security cameras, recorders, or cables.',
          sortOrder: 5,
          categoryId: cctvCategory._id,
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
          categoryId: cctvCategory._id,
          bookingQuestions: [
            { question: "Property Type", type: "select", options: ["Home", "Office", "Shop", "Apartment", "Warehouse", "Factory", "Other"], required: true, placeholder: "Select property type...", sortOrder: 1 },
            { question: "Survey Purpose", type: "select", options: ["New Installation", "Repair", "Upgrade", "AMC"], required: true, placeholder: "Select survey purpose...", sortOrder: 2 }
          ],
          packages: [
            { name: "Free Site Survey", description: "Get a certified engineer to draft a customized layout diagram and quotation", price: 0, originalPrice: 499, duration: "1-2 hours", includes: ["On-site camera placement planning", "Structured cabling path layout", "Detailed estimate sheet"], isPopular: true, isActive: true }
          ]
        }
      ];

      for (const sub of cctvSubcategories) {
        await SubCategory.create(sub);
      }
      console.log("✅ CCTV Category redesigned subcategories seeded successfully.");
    }

    const count = await Category.countDocuments();
    if (count > 0) {
      console.log("[Seeder] Catalog already contains data. Skipping seeder.");
      return;
    }

    console.log("🌱 MongoDB Catalog is empty. Auto-seeding 10 categories and their subcategories...");
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
          { name: 'Wired Camera Installation', slug: 'wired-camera-installation', description: 'Fresh wired CCTV analog camera installation.', sortOrder: 1 },
          { name: 'Wireless Camera Installation', slug: 'wireless-camera-installation', description: 'Install WiFi smart cameras.', sortOrder: 2 },
          { name: 'IP Camera Installation', slug: 'ip-camera-installation', description: 'IP camera network configuration and PoE setup.', sortOrder: 3 },
          { name: 'DVR Setup', slug: 'dvr-setup', description: 'Configure analog DVR and remote viewing.', sortOrder: 4 },
          { name: 'NVR Setup', slug: 'nvr-setup', description: 'Configure IP NVR recorder and storage.', sortOrder: 5 },
          { name: 'CCTV Maintenance', slug: 'cctv-maintenance', description: 'Annual preventive maintenance of CCTV systems.', sortOrder: 6 },
          { name: 'CCTV Repair', slug: 'cctv-repair', description: 'Repair non-working cameras and DVR issues.', sortOrder: 7 },
          { name: 'CCTV Upgrade', slug: 'cctv-upgrade', description: 'Upgrade analog to IP or add extra cameras.', sortOrder: 8 },
          { name: 'CCTV Accessories', slug: 'cctv-accessories', description: 'Junction box, connectors, casings setups.', sortOrder: 9 },
          { name: 'CCTV AMC', slug: 'cctv-amc', description: 'CCTV Annual Maintenance Contract.', sortOrder: 10 },
          { name: 'CCTV Site Survey', slug: 'cctv-survey', description: 'On-site survey for custom security planning.', sortOrder: 11 },
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
          { name: 'New Network Setup', slug: 'new-network-setup', description: 'Install new routers, switches, and APs.', sortOrder: 1 },
          { name: 'WiFi & Internet Issues', slug: 'wifi-internet-issues', description: 'Diagnose and fix slow speeds or drops.', sortOrder: 2 },
          { name: 'Router & Modem', slug: 'router-modem', description: 'Configure broadband routers and modems.', sortOrder: 3 },
          { name: 'Office Network', slug: 'office-network', description: 'Setup office LAN, file sharing, printer setup.', sortOrder: 4 },
          { name: 'Structured Cabling', slug: 'structured-cabling', description: 'Ethernet patching, crimping, and wall jack setups.', sortOrder: 5 },
          { name: 'Network Upgrade', slug: 'network-upgrade', description: 'Upgrade old routers and switches to Gigabit.', sortOrder: 6 },
          { name: 'Network Security', slug: 'network-security', description: 'Firewall rules setup and guest mesh isolation.', sortOrder: 7 },
          { name: 'Server & Storage', slug: 'server-storage', description: 'NAS, backups, and local server integration.', sortOrder: 8 },
          { name: 'Network AMC', slug: 'network-amc', description: 'Annual support contract for office networks.', sortOrder: 9 },
          { name: 'Network Accessories', slug: 'network-accessories', description: 'Network racks, patch panels, patch cords.', sortOrder: 10 },
          { name: 'Network Troubleshooting', slug: 'network-troubleshooting', description: 'General network support and testing.', sortOrder: 11 },
          { name: 'Free Survey', slug: 'network-survey', description: 'Free office network audit and quote planning.', sortOrder: 12 },
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
          { name: 'Buy Laptop', slug: 'buy-laptop', description: 'Buy certified refurbished laptops with warranty.', sortOrder: 1 },
          { name: 'Laptop Repair', slug: 'laptop-repair', description: 'Motherboard, keyboard, hinge, and charging port repair.', sortOrder: 2 },
          { name: 'Laptop Upgrade', slug: 'laptop-upgrade', description: 'SSD upgrades and RAM installation.', sortOrder: 3 },
          { name: 'Laptop Service', slug: 'laptop-service', description: 'Deep dust clean and thermal paste replacement.', sortOrder: 4 },
          { name: 'Software Services', slug: 'laptop-software', description: 'OS installation, software setup, and driver fixes.', sortOrder: 5 },
          { name: 'Data Recovery', slug: 'laptop-data-recovery', description: 'Safe recovery of files from dead laptops.', sortOrder: 6 },
          { name: 'Laptop Accessories', slug: 'laptop-accessories', description: 'Adapters, chargers, cooling pads.', sortOrder: 7 },
          { name: 'Laptop AMC', slug: 'laptop-amc', description: 'Annual maintenance contracts for corporate laptops.', sortOrder: 8 },
          { name: 'Laptop Rental', slug: 'laptop-rental', description: 'Rent business laptops at low prices.', sortOrder: 9 },
          { name: 'Free Diagnosis', slug: 'laptop-diagnosis', description: 'Bring in your laptop for free issues check.', sortOrder: 10 },
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
          { name: 'Buy Desktop', slug: 'buy-desktop', description: 'Refurbished CPU and monitor bundle sales.', sortOrder: 1 },
          { name: 'Desktop Repair', slug: 'desktop-repair', description: 'CPU SMPS, motherboard, and display repairs.', sortOrder: 2 },
          { name: 'Desktop Upgrade', slug: 'desktop-upgrade', description: 'Add RAM, SSD, or graphics cards.', sortOrder: 3 },
          { name: 'Desktop Service', slug: 'desktop-service', description: 'Blowing dust, cleaning components, cooling fan replacement.', sortOrder: 4 },
          { name: 'Desktop Software', slug: 'desktop-software', description: 'Windows installation and antivirus setups.', sortOrder: 5 },
          { name: 'Desktop Data Recovery', slug: 'desktop-data-recovery', description: 'Recover files from old internal hard drives.', sortOrder: 6 },
          { name: 'Custom PC', slug: 'custom-pc', description: 'Custom desktop build design and assembly.', sortOrder: 7 },
          { name: 'Gaming PC', slug: 'gaming-pc', description: 'High-end gaming systems with liquid cooling.', sortOrder: 8 },
          { name: 'Business Support', slug: 'business-support', description: 'Office desktop rollout and Active Directory linking.', sortOrder: 9 },
          { name: 'Desktop AMC', slug: 'desktop-amc', description: 'Annual maintenance contract for desktops.', sortOrder: 10 },
          { name: 'Desktop Accessories', slug: 'desktop-accessories', description: 'Keyboards, mice, UPS power backups.', sortOrder: 11 },
          { name: 'Desktop Rental', slug: 'desktop-rental', description: 'Rent desktop PCs for offices.', sortOrder: 12 },
          { name: 'Free Diagnosis', slug: 'desktop-diagnosis', description: 'Free diagnostic assessment at service center.', sortOrder: 13 },
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
          { name: 'Server Installation', slug: 'server-installation', description: 'Server hardware mount, cabling, and OS load.', sortOrder: 1 },
          { name: 'Server Repair', slug: 'server-repair', description: 'Fix server hardware failures, redundant power supplies.', sortOrder: 2 },
          { name: 'Server Upgrade', slug: 'server-upgrade', description: 'Server RAM and storage disk upgrades.', sortOrder: 3 },
          { name: 'Server Maintenance', slug: 'server-maintenance', description: 'OS patching, raid controller updates.', sortOrder: 4 },
          { name: 'Server Configuration', slug: 'server-config', description: 'Active Directory, DNS, Group Policies setup.', sortOrder: 5 },
          { name: 'Server Migration', slug: 'server-migration', description: 'P2V or database migrations.', sortOrder: 6 },
          { name: 'Server Backup', slug: 'server-backup', description: 'Automated bare-metal backup configurations.', sortOrder: 7 },
          { name: 'Virtualization', slug: 'virtualization', description: 'VMware ESXi, Hyper-V, Proxmox hypervisor setup.', sortOrder: 8 },
          { name: 'Server Storage', slug: 'server-storage', description: 'NAS / SAN storage arrays integration.', sortOrder: 9 },
          { name: 'Cloud Server', slug: 'cloud-server', description: 'AWS EC2 or Azure VM setup.', sortOrder: 10 },
          { name: 'Server Security', slug: 'server-security', description: 'Server hardening, security audits.', sortOrder: 11 },
          { name: 'Server AMC', slug: 'server-amc', description: 'Annual support for servers.', sortOrder: 12 },
          { name: 'Server Accessories', slug: 'server-accessories', description: 'Racks, PDUs, KVM switches.', sortOrder: 13 },
          { name: 'Server Rental', slug: 'server-rental', description: 'Rent rack servers for test labs.', sortOrder: 14 },
          { name: 'Server Assessment', slug: 'server-assessment', description: 'Audit performance bottlenecks.', sortOrder: 15 },
        ],
      },
      {
        name: 'Electronic Contracts',
        slug: 'electronic-contracts',
        description: 'Electrical wiring, panel upgrades, and maintenance contracts.',
        icon: 'Zap',
        color: '#F97316',
        gradient: 'from-orange-500 via-amber-500 to-yellow-500',
        sortOrder: 6,
        subcategories: [
          { name: 'Electrical Installation', slug: 'electrical-installation', description: 'Install DB panels, switches, fixtures.', sortOrder: 1 },
          { name: 'Electrical Repair', slug: 'electrical-repair', description: 'Repair short circuits and fuse issues.', sortOrder: 2 },
          { name: 'Electrical Maintenance', slug: 'electrical-maintenance', description: 'Preventive thermal check of distribution boards.', sortOrder: 3 },
          { name: 'Electrical Wiring', slug: 'electrical-wiring', description: 'Cat casing conduit or open cabling.', sortOrder: 4 },
          { name: 'Lighting Setup', slug: 'lighting-setup', description: 'Install decorative ceiling lights and LED strips.', sortOrder: 5 },
          { name: 'Power Backup', slug: 'power-backup', description: 'Install inverters, battery banks, UPS.', sortOrder: 6 },
          { name: 'Distribution Board', slug: 'db-setup', description: 'Distributor breaker configuration.', sortOrder: 7 },
          { name: 'Earthing Setup', slug: 'earthing-setup', description: 'Copper plate or chemical earthing.', sortOrder: 8 },
          { name: 'Commercial Wiring', slug: 'commercial-wiring', description: 'Office space and retail outlet cabling.', sortOrder: 9 },
          { name: 'Electrical Inspection', slug: 'electrical-inspection', description: 'Check load balance and safety safety.', sortOrder: 10 },
          { name: 'Energy Saving Audit', slug: 'energy-audit', description: 'Optimize consumption patterns.', sortOrder: 11 },
          { name: 'Electrical AMC', slug: 'electrical-amc', description: 'Annual support contract for building power systems.', sortOrder: 12 },
          { name: 'Electrical Products', slug: 'electrical-products', description: 'TNEB compliant DBs, standard cables.', sortOrder: 13 },
          { name: 'Electrical Survey', slug: 'electrical-survey', description: 'Site survey for new HT/LT connections.', sortOrder: 14 },
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
          { name: 'Smart Home Hub', slug: 'smart-home', description: 'Central controller gateway pairing.', sortOrder: 1 },
          { name: 'Smart Lighting Control', slug: 'smart-lighting', description: 'Dimmers and RGB scene selectors.', sortOrder: 2 },
          { name: 'Home Smart Security', slug: 'smart-security', description: 'Integrate sirens and motion sensors.', sortOrder: 3 },
          { name: 'Smart Locks', slug: 'smart-locks', description: 'Install digital fingerprint door locks.', sortOrder: 4 },
          { name: 'Video Door Phone', slug: 'video-door-phone', description: 'VDP monitor and call bell setup.', sortOrder: 5 },
          { name: 'Smart Curtains', slug: 'smart-curtains', description: 'Motorized automatic blinds and curtain track.', sortOrder: 6 },
          { name: 'Climate Control', slug: 'smart-climate', description: 'IR blaster for AC automated control.', sortOrder: 7 },
          { name: 'Smart Appliances Link', slug: 'smart-appliances', description: 'Smart plug scheduler configurations.', sortOrder: 8 },
          { name: 'Smart Entertainment', slug: 'smart-entertainment', description: 'Multiroom audio speaker distribution.', sortOrder: 9 },
          { name: 'Voice Assistant Pairing', slug: 'voice-assistant', description: 'Connect Echo Dot/Google Nest dashboard.', sortOrder: 10 },
          { name: 'Automation Sensors', slug: 'smart-sensors', description: 'Gas leak, flood, motion sensor arrays.', sortOrder: 11 },
          { name: 'Smart Irrigation', slug: 'smart-irrigation', description: 'Automated lawn sprinkler valve setups.', sortOrder: 12 },
          { name: 'Automation Repair', slug: 'automation-repair', description: 'Fix disconnected smart switches and devices.', sortOrder: 13 },
          { name: 'Automation Upgrade', slug: 'automation-upgrade', description: 'Add new sensors to SmartThings hub.', sortOrder: 14 },
          { name: 'Automation AMC', slug: 'automation-amc', description: 'Maintenance contract for smart systems.', sortOrder: 15 },
          { name: 'Automation Products', slug: 'automation-products', description: 'Smart plugs, remote IR hubs, locks.', sortOrder: 16 },
          { name: 'Automation Consultation', slug: 'automation-consultation', description: 'Consultation to map smart requirements.', sortOrder: 17 },
        ],
      },
      {
        name: 'Website Development',
        slug: 'website-development',
        description: 'Professional website design, development, e-commerce, and SEO.',
        icon: 'Globe',
        color: '#EC4899',
        gradient: 'from-pink-500 via-rose-500 to-red-500',
        sortOrder: 8,
        subcategories: [
          { name: 'New Website Setup', slug: 'new-website', description: 'Domain registration, hosting, and CMS load.', sortOrder: 1 },
          { name: 'Business Website', slug: 'business-website', description: 'Custom responsive design for business representation.', sortOrder: 2 },
          { name: 'Ecommerce Website', slug: 'ecommerce-website', description: 'Payment checkout pipelines and product lists.', sortOrder: 3 },
          { name: 'Landing Page Design', slug: 'landing-page', description: 'Single high-conversion lead generation page.', sortOrder: 4 },
          { name: 'Portfolio Website', slug: 'portfolio-website', description: 'Showcase CV, projects, and contacts page.', sortOrder: 5 },
          { name: 'Custom Web App', slug: 'web-app', description: 'Tailored Next.js dynamic application with DB.', sortOrder: 6 },
          { name: 'Website Redesign', slug: 'web-redesign', description: 'Improve UI styling and response layouts.', sortOrder: 7 },
          { name: 'Website Maintenance', slug: 'web-maintenance', description: 'Monthly code edits, CMS updates, backups.', sortOrder: 8 },
          { name: 'Speed Optimization', slug: 'speed-optimization', description: 'Enhance Lighthouse score, image sizes.', sortOrder: 9 },
          { name: 'Website Security Check', slug: 'web-security', description: 'Fix malware, set SSL certificates, secure panels.', sortOrder: 10 },
          { name: 'Domain & Hosting Setup', slug: 'domain-hosting', description: 'Name server settings, DNS records setup.', sortOrder: 11 },
          { name: 'SEO Optimization', slug: 'seo-optimization', description: 'On-page SEO keywords and meta layout tags.', sortOrder: 12 },
          { name: 'Website Content Setup', slug: 'web-content', description: 'Copywriting services for page sections.', sortOrder: 13 },
          { name: 'Website Migration', slug: 'web-migration', description: 'Migrate hosting from GoDaddy to VPS.', sortOrder: 14 },
          { name: 'Website Support', slug: 'web-support', description: 'Hourly support for code debug requirements.', sortOrder: 15 },
          { name: 'Website AMC', slug: 'web-amc', description: 'Annual support plan for corporate sites.', sortOrder: 16 },
          { name: 'Digital Marketing Link', slug: 'digital-marketing', description: 'Connect analytics tracker pipelines.', sortOrder: 17 },
          { name: 'Website Consultation', slug: 'web-consultation', description: 'Discuss wireframes and tech stack.', sortOrder: 18 },
        ],
      },
      {
        name: 'Software Licensing',
        slug: 'software-licensing',
        description: 'Microsoft 365, Windows Pro, SQL Server, and antivirus enterprise license activation.',
        icon: 'Key',
        color: '#D97706',
        gradient: 'from-amber-500 via-orange-500 to-yellow-600',
        sortOrder: 9,
        subcategories: [
          { name: 'Microsoft 365 Setup', slug: 'm365-setup', description: 'Tenant domain mapping and active directory linkage.', sortOrder: 1 },
          { name: 'Windows OS Upgrade', slug: 'windows-upgrade', description: 'Genuine windows license activation key.', sortOrder: 2 },
          { name: 'Antivirus Activation', slug: 'antivirus-activation', description: 'Install secure portal, configure central admin.', sortOrder: 3 },
          { name: 'Database Licensing', slug: 'db-licensing', description: 'Mssql/Oracle core license mapping compliance.', sortOrder: 4 },
          { name: 'Tally Licensing', slug: 'tally-licensing', description: 'Tally Prime accounting license setup.', sortOrder: 5 },
          { name: 'CAD Software License', slug: 'cad-licensing', description: 'Autodesk license keys manager.', sortOrder: 6 },
        ],
      },
      {
        name: 'Cyber Security',
        slug: 'cyber-security',
        description: 'Firewalls, security audits, threat protection, and remote VPN setup.',
        icon: 'ShieldCheck',
        color: '#10B981',
        gradient: 'from-slate-700 via-blue-700 to-cyan-600',
        sortOrder: 10,
        subcategories: [
          { name: 'Managed Firewall Setup', slug: 'managed-firewall-setup', description: 'Install hardware/software firewall rules.', sortOrder: 1 },
          { name: 'Endpoint Protection', slug: 'endpoint-protection', description: 'Antivirus and EDR endpoint deployments.', sortOrder: 2 },
          { name: 'Security Compliance Audit', slug: 'security-audit', description: 'Business IT security checklist review.', sortOrder: 3 },
          { name: 'Vulnerability Assessment', slug: 'vulnerability-assessment', description: 'Scan servers and networks for security gaps.', sortOrder: 4 },
          { name: 'Threat Hardening', slug: 'threat-hardening', description: 'Harden routers, active directory, and OS against threats.', sortOrder: 5 },
          { name: 'Cyber Security AMC', slug: 'security-amc', description: 'Yearly security maintenance contract.', sortOrder: 6 },
        ],
      }
    ];

    for (const catData of CATEGORIES) {
      const { subcategories, ...catFields } = catData;
      const category = await Category.findOneAndUpdate(
        { slug: catFields.slug },
        { $set: catFields },
        { upsert: true, new: true }
      );
      for (const subData of subcategories) {
        const bookingQuestions = [
          { question: "Preferred Brand", type: "select", options: ["Any Brand", "Hikvision", "Dell", "HP", "Microsoft", "Schneider"], required: false, placeholder: "Choose brand", sortOrder: 1 },
          { question: "Site Scope Details", type: "text", options: [], required: false, placeholder: "Describe your custom requirements", sortOrder: 2 }
        ];
        const packages = [
          { name: "Standard Package", description: subData.description, price: 499, originalPrice: 999, duration: "2-4 hours", includes: ["Certified technician support", "Standard diagnostics and testing", "14-day workmanship warranty"], isPopular: true, isActive: true }
        ];
        await SubCategory.findOneAndUpdate(
          { slug: subData.slug },
          { $set: { ...subData, categoryId: category._id, bookingQuestions, packages } },
          { upsert: true, new: true }
        );
      }
    }
    console.log("🌱 Auto-seeded MongoDB categories and subcategories successfully!");
  } catch (err) {
    console.error("Auto-seeding check failed:", err.message);
  }
}

module.exports = { runSeed };
