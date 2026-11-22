import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyMediaRegistry,
  DEFAULT_MEDIA,
  photoSrc,
  resolveMedia,
} from '../../web/src/lib/media.js'
import { canonicalizeProvider } from '../../web/src/lib/experts.js'
import { webpForGalleryUrl } from '../lib/media.js'

test('resolveMedia layers Content Studio overrides over the shared defaults', () => {
  const media = resolveMedia({
    team: { peterAsingo: { src: '/uploads/new-peter.png', webp: '' } },
    facility: { exterior: '/uploads/new-exterior.jpg' },
  })

  assert.equal(photoSrc(media, 'team.peterAsingo'), '/uploads/new-peter.png')
  assert.equal(photoSrc(media, 'facility.exterior'), '/uploads/new-exterior.jpg')
  assert.equal(photoSrc(media, 'team.georgeWafula'), DEFAULT_MEDIA.team.georgeWafula.src)
})

test('applyMediaRegistry propagates a changed photo to saved CMS image fields', () => {
  const originalPortrait = DEFAULT_MEDIA.team.peterAsingo.src
  const originalWebp = DEFAULT_MEDIA.facility.hero.webp
  const site = {
    media: {
      team: { peterAsingo: { src: '/uploads/new-peter.png', webp: '' } },
      facility: { hero: { src: '/images/gallery/DSC_3017.jpg', webp: '' } },
    },
    team: {
      intro: originalPortrait,
      cards: [{ image: originalPortrait }, { image: originalPortrait }],
    },
    home: { hero: { image: originalPortrait, imageWebp: originalWebp } },
  }

  const resolved = applyMediaRegistry(site)

  assert.equal(resolved.team.intro, '/uploads/new-peter.png')
  assert.deepEqual(
    resolved.team.cards.map((card) => card.image),
    ['/uploads/new-peter.png', '/uploads/new-peter.png']
  )
  assert.equal(resolved.home.hero.image, '/uploads/new-peter.png')
  assert.equal(resolved.home.hero.imageWebp, '')

  // The stored CMS object is never mutated; the registry is applied on read.
  assert.equal(site.team.intro, originalPortrait)
  assert.equal(site.home.hero.imageWebp, originalWebp)
  assert.equal(photoSrc(resolved.media, 'team.peterAsingo'), '/uploads/new-peter.png')
})

test('canonicalizeProvider keeps scheduling slugs but corrects identity and photo', () => {
  const media = resolveMedia({
    team: { georgeWafula: { src: '/uploads/new-george.png', webp: '' } },
  })
  const provider = {
    id: 'provider-42',
    slug: 'dr-grace-odhiambo',
    name: 'Legacy demo placeholder',
    image: '/images/legacy/portrait.jpg',
    active: true,
  }

  const canonical = canonicalizeProvider(provider, media)

  assert.equal(canonical.id, 'provider-42')
  assert.equal(canonical.slug, 'dr-grace-odhiambo')
  assert.equal(canonical.name, 'Dr. George Wafula')
  assert.equal(canonical.photoKey, 'team.georgeWafula')
  assert.equal(canonical.image, '/uploads/new-george.png')
})

test('webpForGalleryUrl maps gallery originals to their generated derivative', () => {
  assert.equal(
    webpForGalleryUrl('/images/gallery/DSC_3017.jpg'),
    '/images/gallery/DSC_3017-1080.webp'
  )
  assert.equal(webpForGalleryUrl('/images/team/peter-asingo.jpg'), '')
  assert.equal(webpForGalleryUrl('/images/gallery/DSC_3017-1080.webp'), '')
})
