// Canonical, photo-backed consultant profiles.
//
// The database stores scheduling + booking data, but identity and photography
// live here so every real Comet team member appears consistently across the
// Team, Experts, Home and Booking pages. Legacy slugs from earlier demo data
// are mapped to the correct person so saved databases display real portraits.

import { DEFAULT_MEDIA, photoSrc } from './media.js'

export const EXPERT_PROFILES = [
  {
    slug: 'dr-peter-asingo',
    legacySlugs: [],
    name: "Dr. Peter Ochieng' Asingo",
    title: 'CEO & Founder',
    specialty: 'Executive, Regulatory & Strategy',
    location: 'Machakos',
    bio: 'A career pharmacist with experience in government service and pharmaceutical supply chain. His leadership advocates strict cGMP compliance with a focus on safety, efficacy and quality across the whole product lifecycle.',
    photo: 'team.peterAsingo',
    yearsExperience: 24,
    rating: 4.9,
    reviewsCount: 61,
    email: 'info@comethealthcares.com',
    phone: '+254 725 519 844',
    days: [1, 2, 3, 4, 5],
    start: '09:00',
    end: '16:00',
  },
  {
    slug: 'christopher-musembi',
    legacySlugs: ['dr-linda-mutua'],
    name: 'Christopher Musembi',
    title: 'Head of Projects',
    specialty: 'CDMO & Contract Manufacturing',
    location: 'Machakos',
    bio: 'An accomplished pharmaceutical scientist who oversees project planning, coordination and execution of key operational and strategic initiatives, using technology to fast-track CDMO milestones.',
    photo: 'team.christopherMusembi',
    yearsExperience: 12,
    rating: 4.8,
    reviewsCount: 43,
    email: 'projects@comethealthcare.com',
    phone: '+254 725 519 844',
    days: [1, 2, 3, 4],
    start: '08:30',
    end: '17:00',
  },
  {
    slug: 'dr-george-wafula',
    legacySlugs: ['dr-grace-odhiambo', 'james-karanja'],
    name: 'Dr. George Wafula',
    title: 'Quality Assurance Manager',
    specialty: 'Quality Assurance & GMP',
    location: 'Machakos',
    bio: 'With over 15 years in pharmaceutical quality systems, Dr. Wafula leads GMP discipline, SOP governance, audit readiness and supplier verification across Comet’s operations.',
    photo: 'team.georgeWafula',
    yearsExperience: 15,
    rating: 4.9,
    reviewsCount: 58,
    email: 'qualityassurance@comethealthcare.com',
    phone: '+254 725 519 844',
    days: [2, 3, 4, 5],
    start: '08:00',
    end: '16:30',
  },
  {
    slug: 'bramwel-wambua',
    legacySlugs: ['ann-wanjiru'],
    name: 'Mr. Bramwel Wambua',
    title: 'Quality Control Manager',
    specialty: 'Quality Control & Analytical Testing',
    location: 'Machakos',
    bio: 'Leads laboratory testing, analytical method validation and finished-product evaluation — every result released is backed by rigorous quality control.',
    photo: 'team.bramwelWambua',
    yearsExperience: 12,
    rating: 4.8,
    reviewsCount: 34,
    email: 'qc@comethealthcare.com',
    phone: '+254 725 519 844',
    days: [1, 3, 5],
    start: '09:00',
    end: '16:00',
  },
  {
    slug: 'peter-ngossi',
    legacySlugs: ['samuel-otieno'],
    name: 'Mr. Peter Ngossi',
    title: 'Sales Manager',
    specialty: 'Partnerships & Distribution',
    location: 'Nairobi',
    bio: 'Leads commercial strategy and builds partnerships with hospitals, clinics and distributors across Kenya and the wider East African region.',
    photo: 'team.peterNgossi',
    yearsExperience: 14,
    rating: 4.7,
    reviewsCount: 46,
    email: 'sales@comethealthcare.com',
    phone: '+254 725 519 844',
    days: [1, 2, 3, 4, 5],
    start: '09:00',
    end: '17:00',
  },
  {
    slug: 'julius-mala',
    legacySlugs: [],
    name: 'Mr. Julius Mala',
    title: 'Production Manager',
    specialty: 'Production & Scale-up',
    location: 'Machakos',
    bio: 'Drives production operations where precision meets performance, ensuring every batch is made to exacting standards, on time and in full compliance.',
    photo: 'team.juliusMala',
    yearsExperience: 16,
    rating: 4.8,
    reviewsCount: 29,
    email: 'production@comethealthcare.com',
    phone: '+254 725 519 844',
    days: [2, 3, 4, 5],
    start: '08:00',
    end: '16:30',
  },
  {
    slug: 'josphat-ombui',
    legacySlugs: [],
    name: 'Eng. Josphat Ombui',
    title: 'Facilities & Equipment Manager',
    specialty: 'Facilities & Equipment Compliance',
    location: 'Machakos',
    bio: 'Oversees facilities, utilities and technical systems so pharmaceutical-grade infrastructure remains safe, reliable and inspection-ready.',
    photo: 'team.josphatOmbui',
    yearsExperience: 13,
    rating: 4.7,
    reviewsCount: 22,
    email: 'engineering@comethealthcare.com',
    phone: '+254 725 519 844',
    days: [1, 3, 5],
    start: '08:30',
    end: '16:00',
  },
  {
    slug: 'ben-nyarondia',
    legacySlugs: [],
    name: 'Mr. Ben Nyarondia',
    title: 'Head of Warehouse',
    specialty: 'Logistics & Supply Chain',
    location: 'Machakos',
    bio: 'Leads warehouse operations, inventory control and distribution — keeping materials and finished products handled with precision and compliance.',
    photo: 'team.benNyarondia',
    yearsExperience: 10,
    rating: 4.7,
    reviewsCount: 31,
    email: 'dispatch@comethealthcare.com',
    phone: '+254 725 519 844',
    days: [1, 2, 4, 5],
    start: '08:30',
    end: '16:00',
  },
]

const PROFILE_BY_SLUG = new Map()
for (const profile of EXPERT_PROFILES) {
  PROFILE_BY_SLUG.set(profile.slug, profile)
  for (const slug of profile.legacySlugs) PROFILE_BY_SLUG.set(slug, profile)
}

export function findExpertProfile(slug) {
  return PROFILE_BY_SLUG.get(slug) || null
}

/**
 * Overlay a canonical identity (including its shared photo key) onto a DB
 * provider. Scheduling fields and the provider id/slug stay untouched so
 * bookings keep working for both new and legacy records.
 */
export function canonicalizeProvider(provider, media = DEFAULT_MEDIA) {
  if (!provider) return provider
  const profile = findExpertProfile(provider.slug)
  if (!profile) return provider
  return {
    ...provider,
    name: profile.name,
    title: profile.title,
    specialty: profile.specialty,
    location: profile.location,
    bio: profile.bio,
    yearsExperience: profile.yearsExperience,
    rating: profile.rating,
    reviewsCount: profile.reviewsCount,
    email: profile.email,
    phone: profile.phone,
    slug: provider.slug,
    photoKey: profile.photo,
    image: photoSrc(media, profile.photo) || provider.image,
  }
}

/** Seed-ready expert rows with resolved image paths. */
export const SEED_EXPERTS = EXPERT_PROFILES.map((profile) => ({
  ...profile,
  image: photoSrc(DEFAULT_MEDIA, profile.photo),
}))

const NAME_KEY = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const PERSON_KEYS = new Map([
  [NAME_KEY("Dr. Peter Ochieng' Asingo"), 'team.peterAsingo'],
  [NAME_KEY('Dr. Peter Asingo'), 'team.peterAsingo'],
  [NAME_KEY('Dr. George Wafula'), 'team.georgeWafula'],
  [NAME_KEY('Dr. George Wangasa'), 'team.georgeWafula'],
  [NAME_KEY('Mr. Bramwel Wambua'), 'team.bramwelWambua'],
  [NAME_KEY('Mr. Bramwell Wambua'), 'team.bramwelWambua'],
  [NAME_KEY('Mr. Peter Ngossi'), 'team.peterNgossi'],
  [NAME_KEY('Mr Peter Ngosi'), 'team.peterNgossi'],
  [NAME_KEY('Mr. Julius Mala'), 'team.juliusMala'],
  [NAME_KEY('Eng. Josphat Ombui'), 'team.josphatOmbui'],
  [NAME_KEY('Mr. Ben Nyarondia'), 'team.benNyarondia'],
  [NAME_KEY('Christopher Musembi'), 'team.christopherMusembi'],
])

/** Shared registry key for a person, used by Team/Culture/Experts components. */
export function personPhotoKey(name) {
  return PERSON_KEYS.get(NAME_KEY(name)) || null
}
