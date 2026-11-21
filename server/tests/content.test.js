import { test } from 'node:test'
import assert from 'node:assert/strict'
import { siteContentSchema } from '../lib/validation.js'
import { deepMerge, DEFAULT_SITE_CONTENT, resolveContent } from '../lib/content.js'
import { DEFAULT_MEDIA, updateSharedPhoto } from '../../src/lib/media.js'

test('siteContentSchema accepts a realistic CMS payload', () => {
  const payload = {
    global: { email: 'info@comethealthcares.com', phone: '+254 725 519 844' },
    home: {
      hero: {
        title: 'Expert guidance',
        highlight: 'molecule to market',
        badges: ['GMP Certified', 'PPB Registered'],
        slides: [{ image: '/images/gallery/DSC_3017.jpg', alt: 'Facility' }],
      },
      finalCta: {
        title: 'Have a product question worth',
        primary: { label: 'Book a Consultation', to: '/book' },
      },
    },
    media: { site: { factory: { src: '/images/gallery/DSC_0481.jpg', webp: '' } } },
  }

  const parsed = siteContentSchema.safeParse(payload)
  assert.equal(parsed.success, true, parsed.success ? '' : JSON.stringify(parsed.error.issues))
  assert.equal(parsed.data.home.hero.slides.length, 1)
})

test('siteContentSchema rejects arrays, primitives and prototype-polluting keys', () => {
  assert.equal(siteContentSchema.safeParse([]).success, false)
  assert.equal(siteContentSchema.safeParse('nope').success, false)
  assert.equal(siteContentSchema.safeParse(null).success, false)
  // JSON.parse creates these as own keys; an object literal would only set the prototype.
  assert.equal(siteContentSchema.safeParse(JSON.parse('{"home":{"__proto__":{"hacked":true}}}')).success, false)
  assert.equal(siteContentSchema.safeParse(JSON.parse('{"home":{"constructor":{"prototype":{"x":1}}}}')).success, false)
})

test('siteContentSchema bounds oversized payloads', () => {
  assert.equal(siteContentSchema.safeParse({ note: 'a'.repeat(20001) }).success, false)
  assert.equal(siteContentSchema.safeParse({ items: Array.from({ length: 501 }, () => 1) }).success, false)
})

test('deepMerge ignores unsafe keys so stored data cannot poison defaults', () => {
  const merged = deepMerge({ safe: true }, JSON.parse('{"__proto__":{"polluted":true},"safe":false}'))
  assert.equal(merged.safe, false)
  assert.equal({}.polluted, undefined)
  assert.equal(Object.prototype.polluted, undefined)
})

test('resolveContent keeps factory content when an override omits it', () => {
  const resolved = resolveContent({ home: { hero: { title: 'Custom title' } } })
  assert.equal(resolved.home.hero.title, 'Custom title')
  assert.equal(resolved.home.hero.highlight, DEFAULT_SITE_CONTENT.home.hero.highlight)
  assert.deepEqual(resolved.media, DEFAULT_MEDIA)
})

test('updateSharedPhoto writes to the media branch, never a nested media.media branch', () => {
  const updated = updateSharedPhoto(
    { team: { peterAsingo: { src: DEFAULT_MEDIA.team.peterAsingo.src, webp: '' } } },
    'team.peterAsingo',
    { src: '/uploads/new-peter.png', webp: '' }
  )

  assert.equal(updated.team.peterAsingo.src, '/uploads/new-peter.png')
  assert.equal(updated.media, undefined, 'must not create a duplicate `media` branch')
  assert.deepEqual(Object.keys(updated), ['team'])
})
