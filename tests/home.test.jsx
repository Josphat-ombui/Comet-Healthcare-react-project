import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App.jsx'

const SITE = {
  global: {
    email: 'hello@comet.test',
    phone: '+254 700 000 000',
  },
  home: {
    hero: {
      badge: 'CMS badge · East Africa',
      title: 'CMS hero headline',
      highlight: 'from lab to market',
      badges: ['CMS GMP', 'CMS PPB', 'CMS Trust'],
      slides: [
        { image: '/images/gallery/DSC_0481.jpg', alt: 'CMS high-resolution Comet production line' },
      ],
    },
    experts: {
      eyebrow: 'CMS experts',
      title: 'CMS people who',
      highlight: 'do the work',
      lead: 'CMS experts introduction.',
    },
    finalCta: {
      badge: 'CMS next step',
      title: 'CMS question worth',
      highlight: 'our experts time?',
      lead: 'CMS final call to action lead paragraph.',
      primary: { label: 'CMS Book Now', to: '/book' },
      secondary: { label: 'CMS Send Inquiry', to: '/contact' },
      imageKey: 'site.factory',
    },
  },
  media: {
    site: { lab: { src: '/uploads/shared-lab.jpg', webp: '' } },
  },
}

function json(payload, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => payload }
}

function renderRoute(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  )
}

describe('CMS-driven homepage and calls to action', () => {
  let fetchMock

  beforeEach(() => {
    localStorage.clear()
    fetchMock = vi.fn(async (input) => {
      const url = String(input)
      if (url === '/api/content/site') return json({ site: SITE })
      if (url === '/api/content/media') return json({ items: [] })
      if (url === '/api/providers?pageSize=3') return json({ items: [] })
      if (url === '/api/content/testimonials') return json({ items: [] })
      if (url === '/api/auth/me') return json({ user: null }, false)
      throw new Error(`Unexpected fetch in home test: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('renders the hero copy, badges and high-resolution Comet slide from the CMS', async () => {
    renderRoute('/')

    const heading = await screen.findByRole('heading', { name: /CMS hero headline from lab to market/i }, { timeout: 30000 })
    expect(heading).toBeInTheDocument()
    expect(screen.getByText('CMS badge · East Africa')).toBeInTheDocument()
    for (const badge of ['CMS GMP', 'CMS PPB', 'CMS Trust']) {
      expect(screen.getByText(badge)).toBeInTheDocument()
    }

    const slide = await screen.findByAltText('CMS high-resolution Comet production line')
    expect(slide).toHaveAttribute('src', '/images/gallery/DSC_0481.jpg')
    expect(slide).toHaveAttribute('srcset', expect.stringContaining('DSC_0481-1600.webp'))

    // Shared Photos overrides propagate to the hero's supporting image.
    expect(within(document.body).getByAltText(
      'Scientists and analytical equipment in the Comet Healthcare quality control laboratory'
    )).toHaveAttribute('src', '/uploads/shared-lab.jpg')
  })

  it('renders CMS-led call-to-action copy and links on the homepage', async () => {
    renderRoute('/')

    await screen.findByRole('heading', { name: /CMS question worth our experts time\?/i }, { timeout: 30000 })
    expect(screen.getByText('CMS final call to action lead paragraph.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /CMS Book Now/ })).toHaveAttribute('href', '/book')
    expect(screen.getByRole('link', { name: /CMS Send Inquiry/ })).toHaveAttribute('href', '/contact')
  })

  it('uses the homepage CTA branch for the shared inner-page CTA band', async () => {
    renderRoute('/testimonials')

    await screen.findByRole('heading', { name: /CMS question worth our experts time\?/i }, { timeout: 30000 })
    expect(screen.getByRole('link', { name: /CMS Book Now/ })).toHaveAttribute('href', '/book')
  })
})
