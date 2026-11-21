// Editorial content for the Book a Consultation page. The server CMS provides
// the live copy; these values keep the page useful when the API is unavailable.

import { DEFAULT_MEDIA, photoSrc } from '../../lib/media.js'
import { EXPERT_PROFILES } from '../../lib/experts.js'

export const SEO = {
  title: 'Book a Consultation',
  description: 'Book a direct consultation with Comet Healthcare’s senior pharmaceutical specialists. Real availability, focused 30-minute sessions and clear written next steps.',
}

export const HERO = {
  eyebrow: 'Book a Consultation',
  title: 'Find a time that works',
  lead: 'Real availability from the people who build, register and qualify medicines at Comet — choose a specialist, pick a slot and get a clear written follow-up.',
  imageKey: 'facility.exterior',
}

export const ASSURANCES = [
  { icon: 'shieldcheck', value: '20+', label: 'Years of GMP practice' },
  { icon: 'users', value: '8', label: 'Senior specialists' },
  { icon: 'clock', value: '30 min', label: 'Focused sessions' },
  { icon: 'file', value: 'Written', label: 'Follow-up notes' },
]

export const BOOKING_TYPES = [
  'CDMO consultation',
  'Regulatory consultation',
  'Quality / GMP consultation',
  'R&D consultation',
  'Training consultation',
  'Partnerships & distribution',
  'General consultation',
]

export const PROCESS = [
  { step: '01', title: 'Choose the right specialist', desc: 'Match your question to the person who owns that discipline — from regulatory strategy to production and quality.' },
  { step: '02', title: 'Pick a live slot', desc: 'Availability comes directly from our scheduling system. No phone tag, no tentative holds, no back-and-forth emails.' },
  { step: '03', title: 'Confirm and prepare', desc: 'You receive an instant reference and confirmation. Share a short brief and we will come ready to work.' },
]

export const TRUST = {
  eyebrow: 'Why Comet',
  title: 'Advice from the people who do the work',
  lead: 'You are not routed to a call centre. Our specialists sit inside a PPB-registered, GMP-driven manufacturing operation in Machakos — so the guidance you get is practical, current and accountable.',
  imageKey: 'facility.story',
  points: [
    { icon: 'building', title: 'Grounded in a real plant', desc: 'Our advice comes from active production, QA, QC and regulatory teams — not from a distant sales desk.' },
    { icon: 'shieldcheck', title: 'Quality is the baseline', desc: 'Every conversation starts from patient safety, documented systems and standards that stand up to inspection.' },
    { icon: 'globe', title: 'Built for East Africa', desc: 'We understand PPB and regional pathways, local supply realities and the pressure to keep medicines affordable.' },
  ],
}

export const TOPICS = [
  { icon: 'flask', title: 'CDMO & manufacturing', desc: 'Formulation, scale-up, technology transfer and contract manufacturing at any scale.', slug: 'christopher-musembi', photoKey: 'facility.production' },
  { icon: 'file', title: 'Regulatory & registration', desc: 'PPB and East African dossier strategy, renewals, variations and inspection readiness.', slug: 'dr-peter-asingo', photoKey: 'facility.gmp' },
  { icon: 'shieldcheck', title: 'Quality & GMP', desc: 'Batch release, SOPs, supplier verification, audits and laboratory control.', slug: 'dr-george-wafula', photoKey: 'facility.qualityLab' },
  { icon: 'microscope', title: 'R&D & analytical work', desc: 'Pre-formulation, method validation and bioequivalence-driven development.', slug: 'bramwel-wambua', photoKey: 'facility.analytical' },
  { icon: 'package', title: 'Supply & partnerships', desc: 'Distribution, stockist programmes and affordable access initiatives.', slug: 'peter-ngossi', photoKey: 'facility.packaging' },
  { icon: 'users', title: 'Operations & facilities', desc: 'Production planning, equipment qualification and compliant infrastructure.', slug: 'julius-mala', photoKey: 'facility.operations' },
]

export const EXPECTATIONS = [
  'A focused 30-minute conversation about your product, programme or compliance question.',
  'Straight answers grounded in real Kenyan manufacturing and regulatory practice.',
  'A short written summary with proposed next steps — no obligation to proceed.',
  'Direct introductions to the right quality, regulatory or production colleague when needed.',
]

export const FAQS = [
  { q: 'How long is a consultation?', a: 'Sessions are 30 minutes. Pick the topic that best fits your question and we will prepare around it. If the discussion needs more depth, we will recommend the right follow-up.' },
  { q: 'What should I prepare?', a: 'A short description of your product or challenge, the stage you are at, target markets and any deadlines. You can add this in the notes field when booking.' },
  { q: 'Is there a fee?', a: 'Introductory consultations are complimentary. Any subsequent project scope, testing or manufacturing work is quoted separately and agreed in writing before work begins.' },
  { q: 'Can I change or cancel?', a: 'Yes. Use your booking reference in the client portal to review upcoming consultations, or contact us if you need help rescheduling at short notice.' },
]

/** Real Comet profiles used when the provider API has not loaded yet. */
export const FALLBACK_BOOK_EXPERTS = EXPERT_PROFILES.map((profile) => ({
  id: profile.slug,
  slug: profile.slug,
  name: profile.name,
  title: profile.title,
  specialty: profile.specialty,
  location: profile.location,
  bio: profile.bio,
  image: photoSrc(DEFAULT_MEDIA, profile.photo),
  photoKey: profile.photo,
  yearsExperience: profile.yearsExperience,
  rating: profile.rating,
  reviewsCount: profile.reviewsCount,
  email: profile.email,
  phone: profile.phone,
  active: true,
}))

const merge = (base, override) => ({ ...base, ...(override && typeof override === 'object' ? override : {}) })

const mergeItems = (base, override) =>
  Array.isArray(override) && override.length
    ? override.map((item, i) => (typeof item === 'object' ? merge(base[i] || {}, item) : item))
    : base

/** Resolve server-backed CMS content for the booking page with local defaults. */
export function resolveBookContent(site) {
  const cms = (site && site.book) || {}

  return {
    seo: merge(SEO, cms.seo),
    hero: merge(HERO, cms.hero),
    assurances: mergeItems(ASSURANCES, cms.assurances),
    types: Array.isArray(cms.types) && cms.types.length ? cms.types : BOOKING_TYPES,
    process: mergeItems(PROCESS, cms.process),
    trust: merge(TRUST, cms.trust),
    trustPoints: mergeItems(TRUST.points, cms.trust?.points),
    topics: mergeItems(TOPICS, cms.topics),
    expectations: Array.isArray(cms.expectations) && cms.expectations.length ? cms.expectations : EXPECTATIONS,
    faqs: mergeItems(FAQS, cms.faqs),
  }
}
