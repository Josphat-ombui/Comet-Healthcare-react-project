import { CTA, FOCUS, HERO, MISSION, SEO, VALUES, VISION } from './data.js'

const merge = (base, override) => ({ ...base, ...(override && typeof override === 'object' ? override : {}) })

const mergeItems = (base, override) =>
  Array.isArray(override) && override.length
    ? base.map((item, i) => merge(item, override[i] || {}))
    : base

/** Resolve CMS content for the Mission page with local defaults and legacy fallbacks. */
export function resolveMissionContent(site) {
  const cms = (site && site.mission) || {}
  const legacyBody = cms.body

  const legacyFocus = Array.isArray(legacyBody?.pillars) && legacyBody.pillars.length
    ? FOCUS.items.map((item, i) => {
        const pillar = legacyBody.pillars[i]
        return pillar ? { ...item, title: pillar.title, body: pillar.desc, bullets: [] } : item
      })
    : undefined

  return {
    seo: merge(SEO, cms.seo),
    hero: merge(HERO, cms.hero),
    mission: merge(MISSION, cms.mission || legacyBody),
    vision: merge(VISION, cms.vision),
    values: merge(VALUES, cms.values),
    focus: merge(FOCUS, cms.focus),
    focusItems: mergeItems(FOCUS.items, cms.focus?.items || legacyFocus),
    cta: merge(CTA, cms.cta),
  }
}
