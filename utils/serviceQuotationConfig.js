/**
 * TechBes Unified Service Catalog Configuration for Quotations
 * Defines the 3 supported customer-facing categories and their verified subcategories.
 */

const SUPPORTED_CATEGORIES = {
  CCTV: {
    name: 'CCTV',
    slug: 'cctv',
    aliases: ['cctv', 'cctv surveillance', 'security camera'],
    services: [
      { name: 'Install New CCTV', slug: 'install-new-cctv', aliases: ['install-new-cctv', 'cctv-installation'] },
      { name: 'Repair Existing CCTV', slug: 'repair-existing-cctv', aliases: ['repair-existing-cctv', 'cctv-repair'] },
      { name: 'Maintenance / AMC', slug: 'maintenance-amc', aliases: ['maintenance-amc', 'cctv-maintenance', 'cctv-amc', 'maintenance (amc)'] },
      { name: 'Upgrade Existing CCTV', slug: 'upgrade-existing-cctv', aliases: ['upgrade-existing-cctv', 'cctv-upgrade'] },
      { name: 'Buy CCTV Products', slug: 'buy-cctv-products', aliases: ['buy-cctv-products', 'cctv-products'] },
      { name: 'Free Site Survey', slug: 'free-site-survey', aliases: ['free-site-survey', 'cctv-survey'] },
    ],
  },
  Networking: {
    name: 'Networking',
    slug: 'networking',
    aliases: ['networking', 'network', 'office network'],
    services: [
      { name: 'New Office Network Setup', slug: 'new-network-setup', aliases: ['new-network-setup', 'new office network setup'] },
      { name: 'Wi-Fi & Internet Speed Optimization', slug: 'wifi-internet-issues', aliases: ['wifi-internet-issues', 'wi-fi & internet speed optimization', 'wifi optimization'] },
      { name: 'Router, Switch & Access Point Setup', slug: 'router-modem', aliases: ['router-modem', 'router, switch & access point setup'] },
      { name: 'Office Network Deployment', slug: 'office-network-deployment', aliases: ['office-network-deployment', 'office-network', 'office network deployment'] },
      { name: 'Structured Cat6 / Fiber Cabling', slug: 'structured-cabling', aliases: ['structured-cabling', 'structured cat6 / fiber cabling'] },
      { name: 'Network Hardware Upgrade', slug: 'network-upgrade', aliases: ['network-upgrade', 'network hardware upgrade'] },
      { name: 'Network Security & Firewall', slug: 'network-security', aliases: ['network-security', 'network security & firewall'] },
      { name: 'Server & NAS Storage Integration', slug: 'server-storage', aliases: ['server-storage', 'server & storage', 'server & nas storage integration'] },
      { name: 'Network AMC', slug: 'network-amc', aliases: ['network-amc', 'network amc'] },
      { name: 'Network Accessories', slug: 'network-accessories', aliases: ['network-accessories', 'network accessories'] },
      { name: 'Network Troubleshooting', slug: 'network-troubleshooting', aliases: ['network-troubleshooting', 'network troubleshooting'] },
      { name: 'Free Network Site Audit', slug: 'network-survey', aliases: ['network-survey', 'free survey', 'free network site audit'] },
    ],
  },
  'Web Designing': {
    name: 'Web Designing',
    slug: 'website-development',
    aliases: ['web designing', 'website development', 'website-development', 'web-designing', 'web design'],
    services: [
      { name: 'Business Website', slug: 'business-website', aliases: ['business-website', 'business website'] },
      { name: 'Landing Page', slug: 'landing-page', aliases: ['landing-page', 'landing page design', 'landing page'] },
      { name: 'Ecommerce Website', slug: 'ecommerce-website', aliases: ['ecommerce-website', 'ecommerce website'] },
      { name: 'Custom Web Application', slug: 'web-app', aliases: ['web-app', 'custom web app', 'custom web application'] },
      { name: 'Website Redesign', slug: 'web-redesign', aliases: ['web-redesign', 'website redesign'] },
      { name: 'Website Maintenance', slug: 'web-maintenance', aliases: ['web-maintenance', 'website maintenance'] },
      { name: 'Speed Optimization', slug: 'speed-optimization', aliases: ['speed-optimization', 'speed optimization'] },
      { name: 'Website Security & SSL', slug: 'web-security', aliases: ['web-security', 'website security check', 'website security & ssl'] },
      { name: 'Domain & Hosting Setup', slug: 'domain-hosting', aliases: ['domain-hosting', 'domain & hosting setup'] },
      { name: 'SEO Optimization', slug: 'seo-optimization', aliases: ['seo-optimization', 'seo optimization'] },
      { name: 'Website Content & Copywriting', slug: 'web-content', aliases: ['web-content', 'website content setup', 'website content & copywriting'] },
      { name: 'Website Migration', slug: 'web-migration', aliases: ['web-migration', 'website migration'] },
      { name: 'Website Technical Support', slug: 'web-support', aliases: ['web-support', 'website support', 'website technical support'] },
      { name: 'Website AMC', slug: 'web-amc', aliases: ['web-amc', 'website amc'] },
      { name: 'Digital Marketing & Growth', slug: 'digital-marketing', aliases: ['digital-marketing', 'digital marketing link', 'digital marketing & growth'] },
      { name: 'Web Consultation', slug: 'web-consultation', aliases: ['web-consultation', 'website consultation', 'web consultation'] },
      { name: 'New Website Setup', slug: 'new-website', aliases: ['new-website', 'new website setup'] },
      { name: 'Portfolio Website', slug: 'portfolio-website', aliases: ['portfolio-website', 'portfolio website'] },
      { name: 'Website Development', slug: 'website-development', aliases: ['website-development', 'website development'] },
    ],
  },
};

/**
 * Validates and normalizes service category input.
 * Returns { valid: boolean, canonicalName?: string, categoryConfig?: object }
 */
function validateCategory(input) {
  if (!input || typeof input !== 'string') return { valid: false };
  const normalized = input.trim().toLowerCase();

  for (const [key, config] of Object.entries(SUPPORTED_CATEGORIES)) {
    if (
      key.toLowerCase() === normalized ||
      config.name.toLowerCase() === normalized ||
      config.slug.toLowerCase() === normalized ||
      config.aliases.some((a) => a.toLowerCase() === normalized)
    ) {
      return { valid: true, canonicalName: config.name, categoryConfig: config };
    }
  }

  return { valid: false };
}

/**
 * Validates and normalizes service/subcategory input for a given category.
 * Returns { valid: boolean, canonicalName?: string, slug?: string }
 */
function validateSubcategory(categoryConfig, subcategoryInput) {
  if (!categoryConfig || !subcategoryInput || typeof subcategoryInput !== 'string') {
    return { valid: false };
  }
  const normalized = subcategoryInput.trim().toLowerCase();

  for (const svc of categoryConfig.services) {
    if (
      svc.name.toLowerCase() === normalized ||
      svc.slug.toLowerCase() === normalized ||
      svc.aliases.some((a) => a.toLowerCase() === normalized)
    ) {
      return { valid: true, canonicalName: svc.name, slug: svc.slug };
    }
  }

  return { valid: false };
}

module.exports = {
  SUPPORTED_CATEGORIES,
  validateCategory,
  validateSubcategory,
};
