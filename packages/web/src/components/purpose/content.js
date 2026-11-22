import {
  BELIEF,
  CTA,
  HERO,
  PEOPLE,
  PRINCIPLES,
  SEO,
  SERVICE,
  WELLBEING,
} from './data.js'

const merge = (base, override) => ({ ...base, ...(override && typeof override === 'object' ? override : {}) })

// CMS edits replace arrays wholesale. Merge item-by-item so a partial edit in
// the Content Studio never removes copy or imagery from the other principles.
const mergeItems = (base, override) =>
  Array.isArray(override) && override.length
    ? base.map((item, i) => merge(item, override[i] || {}))
    : base

/**
 * Resolve server-backed CMS content for the Purpose page with local defaults.
 * Older CMS overrides (`body`, `pillars`) are still honoured as fallbacks so
 * content saved before this page expansion is not lost.
 */
export function resolvePurposeContent(site) {
  const cms = (site && site.purpose) || {}

  return {
    seo: merge(SEO, cms.seo),
    hero: merge(HERO, cms.hero),
    belief: merge(BELIEF, cms.belief || cms.body),
    principles: mergeItems(PRINCIPLES, cms.principles),
    wellbeing: merge(WELLBEING, cms.wellbeing),
    service: merge(SERVICE, cms.service),
    people: merge(PEOPLE, cms.people),
    cta: merge(CTA, cms.cta),
  }
}
