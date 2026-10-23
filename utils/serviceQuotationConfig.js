/**
 * TechBes Unified Service Catalog Configuration for Quotations
 * Defines the supported customer-facing categories and their verified subcategories.
 */

function cleanStr(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SUPPORTED_CATEGORIES = {
  CCTV: {
    name: 'CCTV',
    slug: 'cctv',
    aliases: ['cctv', 'cctv surveillance', 'security camera', 'security cameras', 'surveillance', 'cctv cameras'],
    services: [
      {
        name: 'Install New CCTV',
        slug: 'install-new-cctv',
        aliases: [
          'install-new-cctv',
          'cctv-installation',
          'cctv installation',
          'cctv installation & setup',
          'install new cctv',
          'install new cctv system',
          'cctv install',
          'new cctv installation',
          'camera installation',
          'cctv camera installation',
          'fresh camera installation',
          'installation',
        ],
      },
      {
        name: 'Repair Existing CCTV',
        slug: 'repair-existing-cctv',
        aliases: [
          'repair-existing-cctv',
          'cctv-repair',
          'cctv repair',
          'repair cctv',
          'repair existing cctv',
          'cctv camera repair',
          'camera repair',
          'cctv service',
          'cctv troubleshooting',
          'repair',
        ],
      },
      {
        name: 'Maintenance / AMC',
        slug: 'maintenance-amc',
        aliases: [
          'maintenance-amc',
          'cctv-maintenance',
          'cctv-amc',
          'cctv amc',
          'cctv maintenance',
          'maintenance (amc)',
          'maintenance / amc',
          'maintenance & amc',
          'annual maintenance contract',
          'cctv amc contract',
          'amc',
        ],
      },
      {
        name: 'Upgrade Existing CCTV',
        slug: 'upgrade-existing-cctv',
        aliases: [
          'upgrade-existing-cctv',
          'cctv-upgrade',
          'cctv upgrade',
          'upgrade cctv',
          'upgrade existing cctv',
          'cctv system upgrade',
          'camera upgrade',
          'upgrade',
        ],
      },
      {
        name: 'Buy CCTV Products',
        slug: 'buy-cctv-products',
        aliases: [
          'buy-cctv-products',
          'cctv-products',
          'cctv products',
          'buy cctv products',
          'buy cctv',
          'cctv hardware',
          'cctv store',
          'products',
        ],
      },
      {
        name: 'Free Site Survey',
        slug: 'free-site-survey',
        aliases: [
          'free-site-survey',
          'cctv-survey',
          'cctv survey',
          'site survey',
          'free site survey',
          'free survey',
          'cctv site survey',
          'cctv site audit',
          'site audit',
          'survey',
        ],
      },
    ],
  },
  Networking: {
    name: 'Networking',
    slug: 'networking',
    aliases: ['networking', 'network', 'office network', 'lan', 'wifi networking'],
    services: [
      { name: 'New Office Network Setup', slug: 'new-network-setup', aliases: ['new-network-setup', 'new office network setup', 'office network setup'] },
      { name: 'Wi-Fi & Internet Speed Optimization', slug: 'wifi-internet-issues', aliases: ['wifi-internet-issues', 'wi-fi & internet speed optimization', 'wifi optimization', 'wifi speed optimization'] },
      { name: 'Router, Switch & Access Point Setup', slug: 'router-modem', aliases: ['router-modem', 'router, switch & access point setup', 'router setup', 'access point setup'] },
      { name: 'Office Network Deployment', slug: 'office-network-deployment', aliases: ['office-network-deployment', 'office-network', 'office network deployment', 'office network'] },
      { name: 'Structured Cat6 / Fiber Cabling', slug: 'structured-cabling', aliases: ['structured-cabling', 'structured cat6 / fiber cabling', 'structured cabling', 'cat6 cabling', 'fiber cabling'] },
      { name: 'Network Hardware Upgrade', slug: 'network-upgrade', aliases: ['network-upgrade', 'network hardware upgrade', 'network upgrade'] },
      { name: 'Network Security & Firewall', slug: 'network-security', aliases: ['network-security', 'network security & firewall', 'network security', 'firewall setup'] },
      { name: 'Server & NAS Storage Integration', slug: 'server-storage', aliases: ['server-storage', 'server & storage', 'server & nas storage integration', 'server nas storage'] },
      { name: 'Network AMC', slug: 'network-amc', aliases: ['network-amc', 'network amc'] },
      { name: 'Network Accessories', slug: 'network-accessories', aliases: ['network-accessories', 'network accessories'] },
      { name: 'Network Troubleshooting', slug: 'network-troubleshooting', aliases: ['network-troubleshooting', 'network troubleshooting', 'network trouble'] },
      { name: 'Free Network Site Audit', slug: 'network-survey', aliases: ['network-survey', 'free survey', 'free network site audit', 'network site audit'] },
    ],
  },
  'Web Designing': {
    name: 'Web Designing',
    slug: 'website-development',
    aliases: ['web designing', 'website development', 'website-development', 'web-designing', 'web design', 'web development', 'websites'],
    services: [
      { name: 'Business Website', slug: 'business-website', aliases: ['business-website', 'business website', 'corporate website'] },
      { name: 'Landing Page', slug: 'landing-page', aliases: ['landing-page', 'landing page design', 'landing page'] },
      { name: 'Ecommerce Website', slug: 'ecommerce-website', aliases: ['ecommerce-website', 'ecommerce website', 'e-commerce website', 'online store'] },
      { name: 'Custom Web Application', slug: 'web-app', aliases: ['web-app', 'custom web app', 'custom web application', 'web application'] },
      { name: 'Website Redesign', slug: 'web-redesign', aliases: ['web-redesign', 'website redesign', 'web redesign'] },
      { name: 'Website Maintenance', slug: 'web-maintenance', aliases: ['web-maintenance', 'website maintenance'] },
      { name: 'Speed Optimization', slug: 'speed-optimization', aliases: ['speed-optimization', 'speed optimization', 'website speed'] },
      { name: 'Website Security & SSL', slug: 'web-security', aliases: ['web-security', 'website security check', 'website security & ssl', 'ssl setup'] },
      { name: 'Domain & Hosting Setup', slug: 'domain-hosting', aliases: ['domain-hosting', 'domain & hosting setup', 'domain hosting'] },
      { name: 'SEO Optimization', slug: 'seo-optimization', aliases: ['seo-optimization', 'seo optimization', 'seo'] },
      { name: 'Website Content & Copywriting', slug: 'web-content', aliases: ['web-content', 'website content setup', 'website content & copywriting', 'copywriting'] },
      { name: 'Website Migration', slug: 'web-migration', aliases: ['web-migration', 'website migration'] },
      { name: 'Website Technical Support', slug: 'web-support', aliases: ['web-support', 'website support', 'website technical support'] },
      { name: 'Website AMC', slug: 'web-amc', aliases: ['web-amc', 'website amc'] },
      { name: 'Web Consultation', slug: 'web-consultation', aliases: ['web-consultation', 'website consultation', 'web consultation'] },
      { name: 'New Website Setup', slug: 'new-website', aliases: ['new-website', 'new website setup'] },
      { name: 'Portfolio Website', slug: 'portfolio-website', aliases: ['portfolio-website', 'portfolio website'] },
      { name: 'Website Development', slug: 'website-development', aliases: ['website-development', 'website development'] },
    ],
  },
  'Digital Marketing': {
    name: 'Digital Marketing',
    slug: 'digital-marketing',
    aliases: ['digital marketing', 'digital-marketing', 'digital_marketing', 'marketing', 'online marketing', 'podcasting', 'podcast'],
    services: [
      {
        name: 'Digital Marketing',
        slug: 'digital-marketing',
        aliases: ['digital-marketing', 'digital marketing', 'digital-marketing-campaigns', 'seo', 'google ads', 'meta ads', 'performance marketing', 'social media marketing', 'growth marketing'],
      },
      {
        name: 'Podcasting',
        slug: 'podcasting',
        aliases: ['podcasting', 'podcast', 'podcast recording', 'podcast production', 'podcast studio', 'podcast editing', 'full-service podcast'],
      },
      {
        name: 'Podcast Studio Recording',
        slug: 'podcast-studio-recording',
        aliases: ['podcast-studio-recording', 'podcast studio recording', 'studio recording', 'soundproof studio', 'acoustic studio', 'in-studio podcast'],
      },
      {
        name: 'Podcast Video & Audio Editing',
        slug: 'podcast-editing-mastering',
        aliases: ['podcast-editing-mastering', 'podcast editing', 'podcast video & audio editing', 'audio mastering', 'podcast post-production'],
      },
      {
        name: 'Podcast Shorts & Viral Reels',
        slug: 'podcast-shorts-reels',
        aliases: ['podcast-shorts-reels', 'podcast shorts & viral reels', 'podcast shorts', 'viral reels', 'reels clipping', 'shorts clipping'],
      },
      {
        name: 'Podcast Distribution & SEO',
        slug: 'podcast-distribution-seo',
        aliases: ['podcast-distribution-seo', 'podcast distribution & seo', 'podcast distribution', 'spotify podcast', 'youtube podcast'],
      },
      {
        name: 'Remote Podcast Production',
        slug: 'remote-podcast-production',
        aliases: ['remote-podcast-production', 'remote podcast production', 'remote podcast', 'riverside podcast'],
      },
      {
        name: 'Corporate & Executive Podcasting',
        slug: 'corporate-executive-podcasting',
        aliases: ['corporate-executive-podcasting', 'corporate podcast', 'executive podcast', 'brand podcast'],
      },
      {
        name: 'Google Ads & PPC Campaigns',
        slug: 'google-ads-ppc',
        aliases: ['google-ads-ppc', 'google ads & ppc campaigns', 'google ads', 'ppc campaigns', 'ppc'],
      },
      {
        name: 'Meta Ads (IG & FB)',
        slug: 'meta-ads-campaigns',
        aliases: ['meta-ads-campaigns', 'meta ads', 'facebook ads', 'instagram ads', 'meta ads (ig & fb)'],
      },
      {
        name: 'SEO & Organic Growth',
        slug: 'seo-organic-growth',
        aliases: ['seo-organic-growth', 'seo & organic growth', 'organic growth', 'seo services'],
      },
    ],
  },
  AMC: {
    name: 'AMC',
    slug: 'amc',
    aliases: ['amc', 'annual maintenance contract', 'amc plans', 'maintenance', 'amc enquiry', 'it amc', 'amc-plans'],
    services: [
      {
        name: 'Comprehensive AMC',
        slug: 'comprehensive-amc',
        aliases: ['comprehensive-amc', 'comprehensive amc', 'amc', 'annual maintenance contract', 'it amc'],
      },
      {
        name: 'Laptop & Desktop AMC',
        slug: 'laptop-desktop-amc',
        aliases: ['laptop-desktop-amc', 'laptop amc', 'desktop amc', 'computer amc'],
      },
      {
        name: 'CCTV AMC',
        slug: 'cctv-amc',
        aliases: ['cctv-amc', 'cctv amc', 'security camera amc'],
      },
      {
        name: 'Networking AMC',
        slug: 'networking-amc',
        aliases: ['networking-amc', 'network amc', 'office network amc'],
      },
      {
        name: 'Website AMC',
        slug: 'website-amc',
        aliases: ['website-amc', 'website amc', 'web amc'],
      },
    ],
  },
};

/**
 * Validates and normalizes service category input.
 * Returns { valid: boolean, canonicalName?: string, categoryConfig?: object }
 */
function validateCategory(input) {
  if (!input || typeof input !== 'string') return { valid: false };
  const cleaned = cleanStr(input);

  for (const [key, config] of Object.entries(SUPPORTED_CATEGORIES)) {
    if (
      cleanStr(key) === cleaned ||
      cleanStr(config.name) === cleaned ||
      cleanStr(config.slug) === cleaned ||
      config.aliases.some((a) => cleanStr(a) === cleaned)
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
    // If category is CCTV, provide safe fallback
    if (categoryConfig && cleanStr(categoryConfig.name) === 'cctv') {
      const defaultSvc = categoryConfig.services[0];
      return { valid: true, canonicalName: defaultSvc.name, slug: defaultSvc.slug };
    }
    return { valid: false };
  }
  const cleaned = cleanStr(subcategoryInput);

  // Exact or normalized alias match
  for (const svc of categoryConfig.services) {
    if (
      cleanStr(svc.name) === cleaned ||
      cleanStr(svc.slug) === cleaned ||
      svc.aliases.some((a) => cleanStr(a) === cleaned)
    ) {
      return { valid: true, canonicalName: svc.name, slug: svc.slug };
    }
  }

  // Keyword-based heuristic matching for CCTV
  if (cleanStr(categoryConfig.name) === 'cctv') {
    if (cleaned.includes('repair') || cleaned.includes('fix')) {
      const svc = categoryConfig.services.find((s) => s.slug === 'repair-existing-cctv');
      if (svc) return { valid: true, canonicalName: svc.name, slug: svc.slug };
    }
    if (cleaned.includes('amc') || cleaned.includes('maintenance')) {
      const svc = categoryConfig.services.find((s) => s.slug === 'maintenance-amc');
      if (svc) return { valid: true, canonicalName: svc.name, slug: svc.slug };
    }
    if (cleaned.includes('upgrade')) {
      const svc = categoryConfig.services.find((s) => s.slug === 'upgrade-existing-cctv');
      if (svc) return { valid: true, canonicalName: svc.name, slug: svc.slug };
    }
    if (cleaned.includes('product') || cleaned.includes('buy') || cleaned.includes('store')) {
      const svc = categoryConfig.services.find((s) => s.slug === 'buy-cctv-products');
      if (svc) return { valid: true, canonicalName: svc.name, slug: svc.slug };
    }
    if (cleaned.includes('survey') || cleaned.includes('audit')) {
      const svc = categoryConfig.services.find((s) => s.slug === 'free-site-survey');
      if (svc) return { valid: true, canonicalName: svc.name, slug: svc.slug };
    }
    // Default fallback for any CCTV request
    const defaultSvc = categoryConfig.services[0];
    return { valid: true, canonicalName: defaultSvc.name, slug: defaultSvc.slug };
  }

  return { valid: false };
}

module.exports = {
  SUPPORTED_CATEGORIES,
  cleanStr,
  validateCategory,
  validateSubcategory,
};
