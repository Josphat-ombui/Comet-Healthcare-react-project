import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App.jsx'

afterEach(cleanup)

const routes = [
  { path: '/', heading: /expert guidance for the journey/i },
  { path: '/services', heading: /services built for the whole drug lifecycle/i },
  { path: '/products', heading: /products built on 20 years of gmp discipline/i },
  { path: '/about', heading: /about comet healthcare/i },
  { path: '/purpose', heading: /^our purpose$/i },
  { path: '/our-purpose', heading: /^our purpose$/i },
  { path: '/mission', heading: /our mission\s*&\s*vision/i },
  { path: '/culture', heading: /^our culture$/i },
  { path: '/science', heading: /^our science$/i },
  { path: '/team', heading: /^our team$/i },
  { path: '/experts', heading: /senior specialists, ready to consult/i },
  { path: '/book', heading: /find a time that works/i },
  { path: '/testimonials', heading: /the partners and facilities who trust comet/i },
  { path: '/contact', heading: /contact comet healthcare/i },
  { path: '/login', heading: /welcome back/i },
]

describe('route smoke tests', () => {
  for (const route of routes) {
    it(`renders "${route.path}"`, async () => {
      render(
        <MemoryRouter initialEntries={[route.path]}>
          <App />
        </MemoryRouter>
      )
      await screen.findByRole('heading', { name: route.heading }, { timeout: 30000 })
      expect(screen.getByRole('heading', { name: route.heading })).toBeInTheDocument()
    })
  }
})