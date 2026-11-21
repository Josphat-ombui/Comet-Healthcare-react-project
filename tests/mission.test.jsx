import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App.jsx'

afterEach(cleanup)

async function renderPage() {
  render(
    <MemoryRouter initialEntries={['/mission']}>
      <App />
    </MemoryRouter>
  )
  // Routes are lazy-loaded; give the chunk time to resolve before querying.
  await screen.findByRole('heading', { name: /our mission\s*&\s*vision/i, level: 1 }, { timeout: 30000 })
}

describe('Our Mission & Vision page', () => {
  it('renders the full mission narrative', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: /better medicines, built around real patient needs/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /to be the cdmo partner east africa can rely on/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /the standards we hold ourselves to/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /what our mission looks like in practice/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /let’s build the next chapter of healthcare together/i })).toBeInTheDocument()
  })

  it('supports keyboard navigation across the delivery focus areas', async () => {
    await renderPage()
    const customer = await screen.findByRole('tab', { name: /customer centricity/i })
    expect(customer).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(customer, { key: 'ArrowRight' })

    const operations = await screen.findByRole('tab', { name: /operational excellence/i })
    expect(operations).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: /operational excellence/i })).toHaveTextContent(/delivery-in-full/i)
  })

  it('exposes on-page navigation and working CTA links', async () => {
    await renderPage()
    const sectionNav = await screen.findByRole('navigation', { name: 'On this page' })
    expect(within(sectionNav).getByRole('link', { name: 'Our values' })).toHaveAttribute('href', '#values')
    expect(screen.getByRole('link', { name: 'Get in touch' })).toHaveAttribute('href', '/contact')

    const mainNav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(mainNav).getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about')
  })
})
