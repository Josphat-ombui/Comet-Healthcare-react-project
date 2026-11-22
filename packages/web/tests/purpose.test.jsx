import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App.jsx'

afterEach(cleanup)

async function renderPage(path = '/purpose') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  )
  // Routes are lazy-loaded; give the chunk time to resolve before querying.
  await screen.findByRole('heading', { name: 'Our Purpose', level: 1 }, { timeout: 30000 })
}

describe('Our Purpose page', () => {
  it('renders the full purpose narrative', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: 'Our Purpose', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /healthcare is a fundamental human right/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /three principles/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /advance global health/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /let’s build healthier communities/i })).toBeInTheDocument()
  })

  it('supports keyboard navigation across the guiding principles', async () => {
    await renderPage()
    const integrity = await screen.findByRole('tab', { name: /be guided by integrity/i })
    expect(integrity).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(integrity, { key: 'ArrowRight' })

    const excellence = await screen.findByRole('tab', { name: /build trust through excellence/i })
    expect(excellence).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: /build trust through excellence/i })).toHaveTextContent(/ppb-registered operations/i)
  })

  it('exposes on-page navigation and working CTA links', async () => {
    await renderPage()
    expect(await screen.findByRole('navigation', { name: 'On this page' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Our principles' })).toHaveAttribute('href', '#principles')
    expect(screen.getByRole('link', { name: 'Get in touch' })).toHaveAttribute('href', '/contact')
  })

  it('appears in the primary menu and footer with active state', async () => {
    await renderPage('/our-purpose')

    const mainNav = screen.getByRole('navigation', { name: 'Main navigation' })
    const menuLink = within(mainNav).getByRole('link', { name: 'Purpose' })
    expect(menuLink).toHaveAttribute('href', '/our-purpose')
    expect(menuLink).toHaveAttribute('aria-current', 'page')

    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByRole('link', { name: 'Our Purpose' })).toHaveAttribute('href', '/our-purpose')
  })
})
