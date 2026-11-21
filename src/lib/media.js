// Shared photo registry — ONE place to change an image used on the website.
//
// Every reusable photo is stored here as `{ src, webp }` under a semantic key.
// Pages, CMS defaults and the database seed resolve images through these keys,
// so replacing a file path here (or overriding it in Content Studio → Shared
// photos) updates the image everywhere it appears.

export const DEFAULT_MEDIA = {
  team: {
    peterAsingo: { src: '/images/team/peter-asingo.jpg', webp: '' },
    georgeWafula: { src: '/images/team/george-wafula.png', webp: '' },
    bramwelWambua: { src: '/images/team/bramwel-wambua.jpg', webp: '' },
    peterNgossi: { src: '/images/team/peter-ngossi.jpg', webp: '' },
    juliusMala: { src: '/images/team/julius-mala.jpg', webp: '' },
    josphatOmbui: { src: '/images/team/josphat-ombui.jpg', webp: '' },
    benNyarondia: { src: '/images/team/ben-nyarondia.png', webp: '' },
    christopherMusembi: { src: '/images/team/christopher-musembi.jpg', webp: '' },
  },
  facility: {
    hero: { src: '/images/gallery/DSC_3017.jpg', webp: '/images/hero-slider/DSC_3017-1080.webp' },
    story: { src: '/images/gallery/DSC_3119.jpg', webp: '/images/gallery/DSC_3119-1080.webp' },
    packaging: { src: '/images/gallery/DSC_3122.jpg', webp: '/images/hero-slider/DSC_3122-1080.webp' },
    qualityLab: { src: '/images/gallery/DSC_2989.jpg', webp: '/images/hero-slider/DSC_2989-1080.webp' },
    research: { src: '/images/gallery/DSC_3234.jpg', webp: '/images/hero-slider/DSC_3234-1080.webp' },
    analytical: { src: '/images/gallery/DSC_3275.jpg', webp: '/images/hero-slider/DSC_3275-1080.webp' },
    operations: { src: '/images/gallery/DSC_3348.jpg', webp: '/images/hero-slider/DSC_3348-1080.webp' },
    production: { src: '/images/gallery/DSC_0481.jpg', webp: '/images/hero-slider/DSC_0481-1080.webp' },
    tablets: { src: '/images/gallery/DSC_3434.jpg', webp: '/images/hero-slider/DSC_3434-1080.webp' },
    gmp: { src: '/images/gallery/DSC_3513.jpg', webp: '/images/hero-slider/DSC_3513-1080.webp' },
    exterior: { src: '/images/gallery/DSC_2897.jpg', webp: '/images/gallery/DSC_2897-1080.webp' },
  },
  culture: {
    hero: { src: '/images/culture/culture-hero.jpg', webp: '' },
    facility: { src: '/images/culture/culture-facility.jpg', webp: '' },
    teamwork: { src: '/images/culture/culture-teamwork.jpg', webp: '' },
    work: { src: '/images/culture/culture-work.jpg', webp: '' },
  },
  mission: {
    gmp: { src: '/images/mission/mission-gmp.jpg', webp: '' },
    facility: { src: '/images/mission/mission-facility.jpg', webp: '' },
    quality: { src: '/images/mission/mission-quality.jpg', webp: '' },
    lab: { src: '/images/mission/mission-lab.jpg', webp: '' },
    production: { src: '/images/mission/mission-production.jpg', webp: '' },
  },
  site: {
    lab: { src: '/images/lab.jpg', webp: '' },
    science: { src: '/images/science.jpg', webp: '' },
    pharma: { src: '/images/pharma.jpg', webp: '' },
    factory: { src: '/images/factory.jpg', webp: '' },
    community: { src: '/images/community.jpg', webp: '' },
    training: { src: '/images/training.jpg', webp: '' },
    story: { src: '/images/website/about-story.jpg', webp: '/images/website/about-story-1080.webp' },
  },
}

// Friendly labels for Content Studio → Shared photos.
export const MEDIA_GROUPS = [
  {
    id: 'team', label: 'People & portraits',
    hint: 'Change a portrait once and it updates the Team, Culture, Experts, Home and Booking pages together.',
    items: [
      ['team.peterAsingo', "Dr. Peter Ochieng' Asingo — CEO"],
      ['team.georgeWafula', 'Dr. George Wafula — Quality Assurance'],
      ['team.bramwelWambua', 'Mr. Bramwel Wambua — Quality Control'],
      ['team.peterNgossi', 'Mr. Peter Ngossi — Sales'],
      ['team.juliusMala', 'Mr. Julius Mala — Production'],
      ['team.josphatOmbui', 'Eng. Josphat Ombui — Facilities'],
      ['team.benNyarondia', 'Mr. Ben Nyarondia — Warehouse'],
      ['team.christopherMusembi', 'Christopher Musembi — Projects'],
    ],
  },
  {
    id: 'facility', label: 'Facility & manufacturing',
    hint: 'Shared photography used by the homepage, Purpose, Experts and Booking pages.',
    items: [
      ['facility.hero', 'Plant / facility hero'],
      ['facility.story', 'Manufacturing story'],
      ['facility.packaging', 'Packaging area'],
      ['facility.qualityLab', 'Quality control laboratory'],
      ['facility.research', 'Research & development'],
      ['facility.analytical', 'Analytical instruments'],
      ['facility.operations', 'Manufacturing operations'],
      ['facility.production', 'Production line'],
      ['facility.tablets', 'Tablet production'],
      ['facility.gmp', 'GMP environment'],
      ['facility.exterior', 'Facility exterior'],
    ],
  },
  {
    id: 'culture', label: 'Culture',
    hint: 'Photography used by the Our Culture page.',
    items: [
      ['culture.hero', 'Culture hero'],
      ['culture.facility', 'Culture facility'],
      ['culture.teamwork', 'Culture teamwork'],
      ['culture.work', 'Culture at work'],
    ],
  },
  {
    id: 'mission', label: 'Mission & vision',
    hint: 'Photography used by the Mission & Vision page.',
    items: [
      ['mission.gmp', 'GMP standards'],
      ['mission.facility', 'Mission facility'],
      ['mission.quality', 'Quality commitment'],
      ['mission.lab', 'Mission laboratory'],
      ['mission.production', 'Mission production'],
    ],
  },
  {
    id: 'site', label: 'Site imagery',
    hint: 'General imagery reused across About, Science, Home and calls to action.',
    items: [
      ['site.lab', 'Laboratory'],
      ['site.science', 'Science'],
      ['site.pharma', 'Pharmaceuticals'],
      ['site.factory', 'Factory'],
      ['site.community', 'Community'],
      ['site.training', 'Training'],
      ['site.story', 'About story / CTA'],
    ],
  },
]

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function deepMergeMedia(base, override) {
  if (!isPlainObject(override)) return base
  const out = { ...base }
  for (const [key, value] of Object.entries(override)) {
    out[key] = isPlainObject(value) && isPlainObject(base?.[key])
      ? deepMergeMedia(base[key], value)
      : value
  }
  return out
}

/** Default registry + saved Content Studio overrides. */
export function resolveMedia(override) {
  return deepMergeMedia(DEFAULT_MEDIA, override || {})
}

export function getAt(obj, path) {
  return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), obj)
}

/**
 * Apply a Shared Photos edit to the site's `media` branch.
 *
 * `media` is already the registry object (site.media), so paths are relative
 * to it (`team.peterAsingo`, not `media.team.peterAsingo`). Wrapping the path
 * in another `media` key silently saved changes to a branch nothing reads.
 */
export function updateSharedPhoto(media, path, patch) {
  const setIn = (obj, keys, value) => {
    if (keys.length === 0) return value
    const [head, ...rest] = keys
    const base = Array.isArray(obj) ? [...obj] : { ...(obj || {}) }
    base[head] = setIn(obj?.[head], rest, value)
    return base
  }
  let next = media
  for (const [field, fieldValue] of Object.entries(patch)) {
    next = setIn(next, [...path.split('.'), field], fieldValue)
  }
  return next
}

function mediaEntry(media, path) {
  const value = getAt(media || DEFAULT_MEDIA, path)
  // A plain string is accepted for simple CMS overrides.
  return typeof value === 'string' ? { src: value, webp: '' } : value
}

/** Primary image source for a registry key. */
export function photoSrc(media, path) {
  return mediaEntry(media, path)?.src || mediaEntry(DEFAULT_MEDIA, path)?.src || ''
}

/** Optional WebP alternative. Empty when the admin has replaced the primary image. */
export function photoWebp(media, path) {
  return mediaEntry(media, path)?.webp || ''
}

function eachMediaEntry(node, path, visit) {
  for (const [key, value] of Object.entries(node || {})) {
    const next = [...path, key]
    if (isPlainObject(value) && 'src' in value) visit(next, value)
    else if (isPlainObject(value)) eachMediaEntry(value, next, visit)
  }
}

function replacementMap(mediaOverride) {
  const resolved = resolveMedia(mediaOverride)
  const map = new Map()

  eachMediaEntry(DEFAULT_MEDIA, [], (path, fallback) => {
    const entry = mediaEntry(resolved, path.join('.')) || {}
    if (fallback.src && entry.src && entry.src !== fallback.src) {
      map.set(fallback.src, entry.src)
    }
    if (fallback.webp && entry.webp !== fallback.webp) {
      map.set(fallback.webp, entry.webp || '')
    }
  })

  return map
}

function rewriteStrings(value, map) {
  if (typeof value === 'string') {
    let out = value
    for (const [from, to] of map) out = out.split(from).join(to)
    return out
  }
  if (Array.isArray(value)) return value.map((item) => rewriteStrings(item, map))
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteStrings(item, map)]))
  }
  return value
}

/**
 * Make saved CMS image fields follow the shared registry. If an admin replaces
 * `team.peterAsingo`, older stored page content that still points at the old
 * portrait is rewritten on read, without overwriting the database.
 */
export function applyMediaRegistry(site, mediaOverride = site?.media) {
  if (!isPlainObject(site)) return site
  const media = resolveMedia(mediaOverride)
  const map = replacementMap(mediaOverride)
  return { ...(map.size ? rewriteStrings(site, map) : site), media }
}

/** Product/hero gallery helpers keep the filename convention in one place. */
export const gallery = (name) => `/images/gallery/${name}`
export const galleryWebp = (id) => `/images/hero-slider/${id}-1080.webp`

/**
 * Turn a CMS slide (`{ image, alt }`) into the responsive descriptor the hero
 * needs. Gallery photos have 640/1080/1600px WebP derivatives in the project;
 * uploaded photos simply use their original URL.
 */
export function gallerySlide(slide = {}, position = 'center') {
  const image = slide.image || slide.src || ''
  const id = String(image).match(/\/images\/gallery\/(DSC_\d+)\.jpe?g$/i)?.[1]
  return {
    id: id || image || 'slide',
    image,
    src: image,
    srcSet: id
      ? `/images/hero-slider/${id}-640.webp 640w, /images/hero-slider/${id}-1080.webp 1080w, /images/hero-slider/${id}-1600.webp 1600w`
      : '',
    sizes: '100vw',
    preview: id ? galleryWebp(id) : image,
    alt: slide.alt || '',
    position: slide.position || position,
  }
}

/**
 * Resolve a page-level image field: registry photos follow Shared Photos
 * edits, while an explicitly edited CMS field still wins over the registry.
 */
export function mediaImage(media, key, customSrc, customWebp) {
  const registrySrc = photoSrc(media, key)
  const isCustom = Boolean(customSrc) && customSrc !== photoSrc(DEFAULT_MEDIA, key)
  const src = isCustom ? customSrc : registrySrc
  const webp = customWebp !== undefined
    ? customWebp
    : (src === registrySrc ? photoWebp(media, key) : '')
  return { src, webp }
}
