import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App.jsx'

afterEach(cleanup)

async function renderPage() {
  render(
    <MemoryRouter initialEntries={['/culture']}>
      <App />
    </MemoryRouter>
  )
  await screen.findByRole('heading', { name: /^our culture$/i, level: 1 }, { timeout: 30000 })
}

describe('Our Culture page', () => {
  it('renders the full culture narrative', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: /excellence shared\. impact multiplied\./i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /a workplace where people and purpose grow together/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /what we build, every day/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /how we show up for each other/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /the specialists shaping our culture/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /build something meaningful with us/i })).toBeInTheDocument()
  })

  it('supports keyboard navigation across the culture focus areas', async () => {
    await renderPage()
    const leadership = await screen.findByRole('tab', { name: /excellent leadership/i })
    expect(leadership).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(leadership, { key: 'ArrowRight' })

    const employerBrand = await screen.findByRole('tab', { name: /employer brand/i })
    expect(employerBrand).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: /employer brand/i })).toHaveTextContent(/patient outcome/i)
  })

  it('appears in the About dropdown and exposes section and CTA links', async () => {
    await renderPage()
    const mainNav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(mainNav).getByRole('link', { name: /our culture/i })).toHaveAttribute('href', '/culture')

    const sectionNav = await screen.findByRole('navigation', { name: 'On this page' })
    expect(within(sectionNav).getByRole('link', { name: 'Our people' })).toHaveAttribute('href', '#people')
    expect(screen.getByRole('link', { name: 'Get in touch' })).toHaveAttribute('href', '/contact')
  })
})
