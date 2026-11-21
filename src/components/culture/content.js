import { CTA, CULTURE, FOCUS, HERO, PEOPLE, PEOPLE_VISION, SEO, VALUES } from './data.js'

const merge = (base, override) => ({ ...base, ...(override && typeof override === 'object' ? override : {}) })

const mergeItems = (base, override) =>
  Array.isArray(override) && override.length
    ? base.map((item, i) => merge(item, override[i] || {}))
    : base

/** Resolve server-backed CMS content for the Culture page with local defaults. */
export function resolveCultureContent(site) {
  const cms = (site && site.culture) || {}

  return {
    seo: merge(SEO, cms.seo),
    hero: merge(HERO, cms.hero),
    peopleVision: merge(PEOPLE_VISION, cms.peopleVision || cms.body),
    culture: merge(CULTURE, cms.culture),
    focus: merge(FOCUS, cms.focus),
    focusItems: mergeItems(FOCUS.items, cms.focus?.items),
    values: merge(VALUES, cms.values),
    people: merge(PEOPLE, cms.people),
    cta: merge(CTA, cms.cta),
  }
}
