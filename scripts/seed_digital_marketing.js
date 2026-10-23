require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Category = require('../models/Category');
const SubCategory = require('../models/SubCategory');

async function seedDigitalMarketing() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set in BE/.env');
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB.');

  // 1. Check if there is an old placeholder SubCategory with slug 'digital-marketing' under another category (e.g. Website Development)
  const websiteCat = await Category.findOne({ slug: 'website-development' });
  if (websiteCat) {
    const oldSub = await SubCategory.findOne({ categoryId: websiteCat._id, slug: 'digital-marketing' });
    if (oldSub) {
      oldSub.slug = 'web-analytics-link';
      oldSub.name = 'Analytics & Tracking Link';
      await oldSub.save();
      console.log('Updated legacy Website Development subcategory slug to web-analytics-link');
    }
  }

  // 2. Upsert 'Digital Marketing' Category
  const dmCat = await Category.findOneAndUpdate(
    { slug: 'digital-marketing' },
    {
      $set: {
        name: 'Digital Marketing',
        slug: 'digital-marketing',
        description: 'Performance growth marketing, Google & Meta Ads, SEO, and professional podcast production studio.',
        icon: 'Megaphone',
        color: '#8B5CF6',
        gradient: 'from-purple-500 via-pink-500 to-rose-600',
        sortOrder: 4,
        isActive: true,
      },
    },
    { upsert: true, new: true }
  );
  console.log('Category upserted:', dmCat.name, dmCat._id);

  // 3. Define Podcasting and Digital Marketing Subcategories
  const subcategories = [
    // ── Podcasting Subcategories ──
    {
      name: 'Podcasting',
      slug: 'podcasting',
      description: 'Full-service podcast production in Bangalore. Multi-camera 4K filming, broadcast-quality audio with Shure mics, color-graded editing, and viral shorts clipping.',
      icon: 'Mic',
      sortOrder: 1,
      bookingQuestions: [
        { question: 'Planned Episode Count', type: 'select', options: ['1 Pilot Episode', '4 Episodes (Monthly Pack)', '8 Episodes (Bi-Monthly)', '12+ Episodes (Full Season)'], required: true, placeholder: 'Select episode count', sortOrder: 1 },
        { question: 'Host & Guest Format', type: 'select', options: ['Solo Host (Solo monologue)', 'Host + 1 In-Studio Guest', 'Host + 2-3 Panel Guests', 'Host + Remote Online Guest'], required: true, placeholder: 'Select host and guest setup', sortOrder: 2 },
        { question: 'Recording Preference', type: 'select', options: ['TechBes Soundproof Studio (Bangalore)', 'Client Corporate Office Setup (Mobile Rig)', 'Remote Digital Studio Setup'], required: true, placeholder: 'Select recording location', sortOrder: 3 },
        { question: 'Podcast Show Name / Topic', type: 'text', options: [], required: false, placeholder: 'What is your podcast show name or topic?', sortOrder: 4 },
      ],
      packages: [
        { name: 'Pilot Episode Package', description: 'Complete 60-min podcast recording with 4K multi-cam setup and broadcast audio.', price: 2999, originalPrice: 4999, duration: '2 hours studio time', includes: ['Acoustic soundproof studio', 'Shure SM7B broadcast mics', 'Raw 4K video & multi-track audio handover'], isPopular: false, isActive: true },
        { name: 'Monthly Podcaster Pro (4 Episodes)', description: '4 episodes recorded, edited, color graded with 12 viral shorts clips.', price: 14999, originalPrice: 24999, duration: 'Monthly retainer', includes: ['4 in-studio recording sessions', 'Full multi-cam post-production', '12 vertical shorts / reels with animated subtitles', 'YouTube & Spotify distribution'], isPopular: true, isActive: true },
        { name: 'Corporate Thought Leadership Series', description: 'End-to-end podcast production for founders and enterprises with branding and distribution.', price: 29999, originalPrice: 45000, duration: 'Per season / quarterly', includes: ['Executive interview prep & scripting assistance', '4K cinematic multi-camera filming', 'Bespoke intro/outro & motion graphics', 'Full distribution & promotional clipping'], isPopular: false, isActive: true },
      ],
    },
    {
      name: 'Podcast Studio Recording',
      slug: 'podcast-studio-recording',
      description: 'Acoustic soundproof studio in Bangalore with 4K multi-camera filming and broadcast Shure microphones.',
      icon: 'Mic',
      sortOrder: 2,
      bookingQuestions: [
        { question: 'Studio Session Duration', type: 'select', options: ['1 Hour Session', '2 Hours Session', 'Half Day (4 Hours)', 'Full Day (8 Hours)'], required: true, placeholder: 'Select duration', sortOrder: 1 },
        { question: 'Number of In-Studio Participants', type: 'select', options: ['1 Person', '2 People', '3-4 People'], required: true, placeholder: 'Select number of participants', sortOrder: 2 },
      ],
      packages: [
        { name: 'Hourly Studio Rental', description: 'Access to soundproof studio with engineer on deck.', price: 1499, originalPrice: 2499, duration: '1 hour', includes: ['Trained sound engineer on-site', 'Shure mics & 4K camera rig', 'Instant SD card / cloud transfer'], isPopular: true, isActive: true },
      ],
    },
    {
      name: 'Podcast Video & Audio Editing',
      slug: 'podcast-editing-mastering',
      description: 'Post-production editing, color grading, vocal mastering, noise suppression, and multi-cam video switching.',
      icon: 'SlidersHorizontal',
      sortOrder: 3,
      bookingQuestions: [
        { question: 'Episode Length', type: 'select', options: ['Under 30 Minutes', '30 - 60 Minutes', '60 - 90 Minutes'], required: true, placeholder: 'Select length', sortOrder: 1 },
      ],
      packages: [
        { name: 'Standard Post-Production', description: 'Complete audio cleaning and multi-camera switching for 1 episode.', price: 1999, originalPrice: 3499, duration: '48 hours turnaround', includes: ['Noise removal & vocal EQ/compression', 'Camera switching', 'Title card & intro/outro addition'], isPopular: true, isActive: true },
      ],
    },
    {
      name: 'Podcast Shorts & Viral Reels',
      slug: 'podcast-shorts-reels',
      description: 'Viral 9:16 vertical shorts and reels clipping with dynamic animated captions, sound effects, and hook optimizations.',
      icon: 'Video',
      sortOrder: 4,
      bookingQuestions: [
        { question: 'Number of Shorts Desired', type: 'select', options: ['3 Viral Clips', '6 Viral Clips', '10 Viral Clips'], required: true, placeholder: 'Select clip count', sortOrder: 1 },
      ],
      packages: [
        { name: 'Viral Shorts Starter (3 Clips)', description: '3 dynamic 9:16 vertical shorts from your long-form episode.', price: 1499, originalPrice: 2499, duration: '24-48 hours', includes: ['Hook-optimized clipping', 'Animated trendy captions', 'Color grading and sound effects'], isPopular: true, isActive: true },
      ],
    },
    {
      name: 'Podcast Distribution & SEO',
      slug: 'podcast-distribution-seo',
      description: 'Channel management, distribution to Spotify, Apple Podcasts, YouTube, show notes, and podcast SEO.',
      icon: 'Radio',
      sortOrder: 5,
      bookingQuestions: [
        { question: 'Platforms Required', type: 'multiselect', options: ['Spotify', 'Apple Podcasts', 'YouTube', 'Amazon Music'], required: true, placeholder: 'Select platforms', sortOrder: 1 },
      ],
      packages: [
        { name: 'Channel Launch & RSS Setup', description: 'Complete podcast channel onboarding and distribution pipeline setup.', price: 2499, originalPrice: 4000, duration: '2-3 days', includes: ['RSS feed configuration', 'Custom cover art formatting', 'Directory submission & verification'], isPopular: true, isActive: true },
      ],
    },
    {
      name: 'Remote Podcast Production',
      slug: 'remote-podcast-production',
      description: 'Studio-quality remote recording setup with separate high-bitrate local audio and video tracks.',
      icon: 'Globe',
      sortOrder: 6,
      bookingQuestions: [
        { question: 'Remote Platform Preference', type: 'select', options: ['Riverside.fm', 'SquadCast', 'Zoom Pro Audio', 'TechBes Assisted'], required: false, placeholder: 'Select platform', sortOrder: 1 },
      ],
      packages: [
        { name: 'Assisted Remote Session', description: 'Engineer manages the remote recording room, soundcheck, and backup.', price: 1999, originalPrice: 3500, duration: '90 minutes', includes: ['Technical soundcheck with guest', 'Dual-ended local 4K & WAV capture', 'Emergency backup channel'], isPopular: true, isActive: true },
      ],
    },

    // ── Digital Marketing Subcategories ──
    {
      name: 'Digital Marketing',
      slug: 'digital-marketing-campaigns',
      description: 'Comprehensive SEO, performance marketing (Google & Meta Ads), brand positioning, and analytics.',
      icon: 'Megaphone',
      sortOrder: 7,
      bookingQuestions: [
        { question: 'Target Channels', type: 'multiselect', options: ['Google Ads (PPC)', 'Meta (IG/FB) Ads', 'SEO & Local Maps', 'Social Media Management'], required: true, placeholder: 'Select marketing channels', sortOrder: 1 },
        { question: 'Monthly Ad Budget', type: 'select', options: ['₹10,000 - ₹25,000', '₹25,000 - ₹50,000', '₹50,000 - ₹1,00,000', '₹1,00,000+'], required: true, placeholder: 'Select budget', sortOrder: 2 },
      ],
      packages: [
        { name: 'Starter Marketing Setup', description: 'Campaign architecture, pixel tracking, and 1 ad set launch', price: 4999, originalPrice: 8999, duration: '3-5 days', includes: ['Google/Meta ad setup', 'Pixel conversion tracking', 'Keyword research', 'Targeting setup'], isPopular: false, isActive: true },
        { name: 'Growth Marketing Pack', description: 'Full-funnel campaign management, weekly optimization, and creative ad copies', price: 14999, originalPrice: 24999, duration: 'Monthly', includes: ['Multi-channel campaigns', 'A/B creative testing', 'Bi-weekly ROI reporting', 'Dedicated account strategist'], isPopular: true, isActive: true },
      ],
    },
    {
      name: 'Google Ads & PPC Campaigns',
      slug: 'google-ads-ppc',
      description: 'High-intent search, Performance Max, and display remarketing campaigns for maximum ROI.',
      icon: 'Rocket',
      sortOrder: 8,
      bookingQuestions: [
        { question: 'Campaign Objective', type: 'select', options: ['Inbound Phone Leads', 'E-Commerce Purchases', 'Local Store Visits', 'Brand Awareness'], required: true, placeholder: 'Select objective', sortOrder: 1 },
      ],
      packages: [
        { name: 'Google Ads Launchpad', description: 'Setup search keywords, negative lists, conversion actions, and copy.', price: 4999, originalPrice: 8000, duration: '3-4 days', includes: ['Search campaign setup', 'Conversion action linking', 'Negative keyword list', '2 ad copy variations'], isPopular: true, isActive: true },
      ],
    },
    {
      name: 'Meta Ads (IG & FB)',
      slug: 'meta-ads-campaigns',
      description: 'Targeted lead generation, retargeting funnels, and creative ad copies for Facebook & Instagram.',
      icon: 'Sparkles',
      sortOrder: 9,
      bookingQuestions: [
        { question: 'Target Location', type: 'text', options: [], required: false, placeholder: 'Cities or regions to target', sortOrder: 1 },
      ],
      packages: [
        { name: 'Meta Lead Gen Campaign', description: 'Instant form lead ads on Instagram and Facebook with CRM webhook link.', price: 4499, originalPrice: 7500, duration: '3 days', includes: ['Instant lead form setup', 'Audience demographics targeting', '3 ad creative formats', 'Lead notification hook'], isPopular: true, isActive: true },
      ],
    },
    {
      name: 'SEO & Organic Growth',
      slug: 'seo-organic-growth',
      description: 'Technical SEO audits, keyword ranking strategy, content optimization, and Google Maps local SEO.',
      icon: 'Globe',
      sortOrder: 10,
      bookingQuestions: [
        { question: 'Website URL', type: 'text', options: [], required: false, placeholder: 'https://yourwebsite.com', sortOrder: 1 },
      ],
      packages: [
        { name: 'Comprehensive SEO Audit & Roadmap', description: 'Deep-dive technical, on-page, and backlink audit with prioritized fix list.', price: 3999, originalPrice: 6500, duration: '3 days', includes: ['Lighthouse & Core Web Vitals audit', 'Keyword ranking baseline', 'Competitor gap analysis', 'Detailed action checklist'], isPopular: true, isActive: true },
      ],
    },
  ];

  for (const sub of subcategories) {
    const res = await SubCategory.findOneAndUpdate(
      { slug: sub.slug },
      { $set: { ...sub, categoryId: dmCat._id, isActive: true } },
      { upsert: true, new: true }
    );
    console.log(`SubCategory upserted: ${res.name} (slug: ${res.slug})`);
  }

  console.log('✅ Digital Marketing & Podcasting catalog seeded successfully!');
  await mongoose.disconnect();
}

seedDigitalMarketing().catch((err) => {
  console.error('Failed to seed Digital Marketing catalog:', err);
  process.exit(1);
});
