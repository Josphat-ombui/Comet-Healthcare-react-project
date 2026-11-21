import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App.jsx'

const MEDIA_OVERRIDES = {
  team: {
    peterAsingo: { src: '/uploads/shared-peter.png', webp: '' },
  },
  facility: {
    exterior: { src: '/uploads/shared-exterior.jpg', webp: '' },
    production: { src: '/uploads/shared-production.jpg', webp: '' },
    story: { src: '/uploads/shared-story.jpg', webp: '' },
  },
}

const PROVIDERS = [
  {
    id: 'provider-1',
    slug: 'dr-peter-asingo',
    name: 'Legacy demo placeholder',
    title: 'Old title',
    specialty: 'Old specialty',
    location: 'Elsewhere',
    image: '/images/legacy/portrait.jpg',
    rating: 1,
    reviewsCount: 1,
    yearsExperience: 1,
    active: true,
  },
  {
    id: 'provider-2',
    slug: 'dr-george-wafula',
    name: 'Another placeholder',
    title: 'Old title',
    specialty: 'Old specialty',
    location: 'Elsewhere',
    image: '/images/legacy/portrait-2.jpg',
    rating: 1,
    reviewsCount: 1,
    yearsExperience: 1,
    active: true,
  },
]

const SITE = {
  book: {
    seo: {
      title: 'Book a Comet Specialist',
      description: 'CMS booking description.',
    },
    hero: {
      eyebrow: 'Consult a specialist',
      title: 'Book a Comet specialist',
      lead: 'CMS-led introduction to Comet consultations.',
      imageKey: 'facility.exterior',
    },
    assurances: [
      { icon: 'shieldcheck', value: '20+', label: 'Years of GMP practice' },
      { icon: 'users', value: '8', label: 'Senior specialists' },
      { icon: 'clock', value: '30 min', label: 'Focused sessions' },
      { icon: 'file', value: 'Written', label: 'Follow-up notes' },
    ],
    types: ['CDMO consultation', 'Regulatory consultation', 'General consultation'],
    process: [
      { step: '01', title: 'Choose the right specialist', desc: 'Match your question to the right discipline.' },
      { step: '02', title: 'Pick a live slot', desc: 'Availability comes from our scheduling system.' },
      { step: '03', title: 'Confirm and prepare', desc: 'Get a reference and share a short brief.' },
    ],
    trust: {
      eyebrow: 'Why Comet',
      title: 'Guidance from inside the plant',
      lead: 'CMS trust section: advice grounded in an active GMP facility.',
      imageKey: 'facility.story',
      points: [
        { icon: 'building', title: 'Grounded in a real plant', desc: 'Advice from active production teams.' },
        { icon: 'shieldcheck', title: 'Quality is the baseline', desc: 'Every conversation starts with patient safety.' },
        { icon: 'globe', title: 'Built for East Africa', desc: 'We understand local regulatory pathways.' },
      ],
    },
    topics: [
      {
        icon: 'flask',
        title: 'CDMO & manufacturing',
        desc: 'Formulation, scale-up and contract manufacturing.',
        slug: 'christopher-musembi',
        photoKey: 'facility.production',
      },
      {
        icon: 'file',
        title: 'Regulatory & registration',
        desc: 'PPB and East African dossier strategy.',
        slug: 'dr-peter-asingo',
        photoKey: 'facility.gmp',
      },
    ],
    expectations: [
      'A focused 30-minute conversation about your question.',
      'A short written summary with proposed next steps.',
    ],
    faqs: [
      {
        q: 'How long is a consultation?',
        a: 'CMS answer: sessions are 30 minutes and include written follow-up.',
      },
    ],
  },
  media: MEDIA_OVERRIDES,
}

const SLOTS = [
  { start: '09:00', end: '09:30', available: true },
  { start: '09:30', end: '10:00', available: false },
]

function json(payload, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => payload }
}

function renderBook(path = '/book') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  )
}

describe('Book page', () => {
  let fetchMock

  beforeEach(() => {
    localStorage.clear()
    fetchMock = vi.fn(async (input) => {
      const url = String(input)

      if (url === '/api/content/site') return json({ site: SITE })
      if (url === '/api/content/media') return json({ items: [] })
      if (url === '/api/providers?pageSize=50') {
        return json({ items: PROVIDERS, total: PROVIDERS.length })
      }
      if (url.includes('/slots?date=')) return json({ slots: SLOTS })

      const profileMatch = url.match(/^\/api\/providers\/([^/?]+)$/)
      if (profileMatch) {
        const provider = PROVIDERS.find((item) => item.slug === profileMatch[1])
        if (provider) return json({ provider, schedules: [] })
        return json({ error: 'Not found' }, false)
      }

      throw new Error(`Unexpected fetch in Book test: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('renders CMS-backed guidance using shared registry photography', async () => {
    const { container } = renderBook()

    await screen.findByRole(
      'heading',
      { name: 'Book a Comet specialist', level: 1 },
      { timeout: 30000 }
    )
    expect(screen.getByText('CMS-led introduction to Comet consultations.')).toBeInTheDocument()
    expect(document.title).toBe('Book a Comet Specialist | Comet Healthcare')

    // The informative sections are present, not just the scheduling widget.
    expect(screen.getByRole('heading', { name: 'Start with the outcome you need' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Book your consultation' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'A clear path from question to next step' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Guidance from inside the plant' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'A useful conversation, not a sales call' })).toBeInTheDocument()
    expect(screen.getByText('How long is a consultation?')).toBeInTheDocument()
    expect(screen.getByText('CMS answer: sessions are 30 minutes and include written follow-up.')).toBeInTheDocument()

    // Facility photography resolves through the single shared registry.
    expect(screen.getByRole('img', { name: 'Comet Healthcare manufacturing facility in Machakos' }))
      .toHaveAttribute('src', '/uploads/shared-exterior.jpg')
    expect(container.querySelector('img[src="/uploads/shared-production.jpg"]')).toBeInTheDocument()
    expect(container.querySelector('img[src="/uploads/shared-story.jpg"]')).toBeInTheDocument()

    // Provider API records are canonicalised to real Comet people and portraits.
    const portrait = await screen.findByAltText(
      "Portrait of Dr. Peter Ochieng' Asingo",
      {},
      { timeout: 10000 }
    )
    expect(portrait).toHaveAttribute('src', '/uploads/shared-peter.png')
    expect(screen.queryByText('Legacy demo placeholder')).not.toBeInTheDocument()
  })

  it('loads a deep-linked specialist portrait and live slots from the API', async () => {
    renderBook('/book/dr-peter-asingo')

    await screen.findByRole(
      'heading',
      { name: 'Book a Comet specialist', level: 1 },
      { timeout: 30000 }
    )
    const portrait = await screen.findByAltText(
      "Portrait of Dr. Peter Ochieng' Asingo",
      {},
      { timeout: 10000 }
    )
    expect(portrait).toHaveAttribute('src', '/uploads/shared-peter.png')

    expect(
      await screen.findByRole(
        'heading',
        { name: "Dr. Peter Ochieng' Asingo", level: 3 },
        { timeout: 10000 }
      )
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: '09:00' }, { timeout: 10000 })
    ).toBeInTheDocument()

    expect(fetchMock).toHaveBeenCalledWith('/api/providers/dr-peter-asingo', expect.anything())
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/providers/dr-peter-asingo/slots?date='))
    ).toBe(true)
  })
})
