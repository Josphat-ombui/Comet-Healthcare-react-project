// Homepage editorial content. CMS values flow in from Home.jsx where available;
// photos resolve through the shared registry so one edit applies everywhere.

import { DEFAULT_MEDIA, gallery, photoSrc } from '../../lib/media.js'

// Ten authentic facility photographs, each with responsive WebP variants so a
// phone downloads ~10–50 KB instead of the full 1920px original.
const heroSlide = (id, alt, position = 'center') => ({
  id,
  src: gallery(`${id}.jpg`),
  srcSet: `/images/hero-slider/${id}-640.webp 640w, /images/hero-slider/${id}-1080.webp 1080w, /images/hero-slider/${id}-1600.webp 1600w`,
  sizes: '100vw',
  preview: `/images/hero-slider/${id}-1080.webp`,
  alt,
  position,
})

export const HERO_IMAGES = [
  heroSlide('DSC_3017', 'Comet Healthcare manufacturing facility'),
  heroSlide('DSC_0481', 'Pharmaceutical production line'),
  heroSlide('DSC_2989', 'Quality control laboratory'),
  heroSlide('DSC_3122', 'Pharmaceutical packaging area'),
  heroSlide('DSC_3234', 'Laboratory research and testing'),
  heroSlide('DSC_3275', 'Analytical instruments in the quality control lab'),
  heroSlide('DSC_2897', 'Pharmaceutical facility exterior'),
  heroSlide('DSC_3348', 'Manufacturing operations at Comet Healthcare'),
  heroSlide('DSC_3434', 'Tablet production and finishing'),
  heroSlide('DSC_3513', 'GMP-compliant production environment'),
]

export const ACCREDITATIONS = [
  { icon: 'shieldcheck', title: 'PPB Certified', detail: 'Fully licensed by the Pharmacy & Poisons Board' },
  { icon: 'award', title: 'GMP Compliant', detail: 'Manufacturing to recognised quality standards' },
  { icon: 'clock', title: '20+ Years', detail: 'Of continuous pharmaceutical practice' },
  { icon: 'globe', title: 'East Africa', detail: 'Serving partners across the region' },
]

export const IMPACT_STATS = [
  { value: 20, suffix: '+', label: 'Years of experience', detail: 'GMP manufacturing and scientific practice' },
  { value: 14, suffix: '+', label: 'Registered products', detail: 'Supported from dossier to market' },
  { value: 100, suffix: '%', label: 'Batch quality tested', detail: 'Before any product leaves our facility' },
]

export const INNOVATIONS = [
  {
    image: photoSrc(DEFAULT_MEDIA, 'facility.hero'),
    category: 'Manufacturing',
    title: 'A facility built for precision',
    desc: 'Modern production lines, controlled environments and disciplined processes under one roof.',
  },
  {
    image: photoSrc(DEFAULT_MEDIA, 'facility.qualityLab'),
    category: 'Quality control',
    title: 'Science behind every batch',
    desc: 'Analytical testing and documentation that make quality measurable, repeatable and auditable.',
  },
  {
    image: photoSrc(DEFAULT_MEDIA, 'facility.packaging'),
    category: 'Registration',
    title: 'Ready for the market',
    desc: 'Packaging and regulatory support designed to move products confidently into distribution.',
  },
]

export const COMPARISON = [
  { feature: 'Regulatory registration', comet: 'In-house dossier specialists', other: 'Outsourced, fragmented' },
  { feature: 'Quality & GMP systems', comet: 'Audited, documented, daily', other: 'Basic compliance only' },
  { feature: 'Direct expert access', comet: 'Book senior specialists', other: 'Account managers only' },
  { feature: 'Lifecycle accountability', comet: 'One accountable partner', other: 'Multiple vendors' },
]

export const INSIGHTS = [
  {
    image: photoSrc(DEFAULT_MEDIA, 'site.science'),
    category: 'Quality',
    title: 'Why GMP discipline is a commercial advantage',
    desc: 'How documented quality systems shorten audits, build buyer confidence and protect your brand.',
    to: '/science',
  },
  {
    image: photoSrc(DEFAULT_MEDIA, 'site.training'),
    category: 'Regulatory',
    title: 'A practical guide to product registration in East Africa',
    desc: 'What to prepare, what reviewers look for, and the mistakes that slow approvals down.',
    to: '/services',
  },
  {
    image: photoSrc(DEFAULT_MEDIA, 'site.community'),
    category: 'Partnerships',
    title: 'Choosing the right CDMO partner for your portfolio',
    desc: 'Five questions to ask before you commit your formulation, timeline and reputation.',
    to: '/contact',
  },
]
