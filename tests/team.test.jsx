import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App.jsx'

afterEach(cleanup)

const EXPECTED_PORTRAITS = {
  "Dr. Peter Ochieng' Asingo": '/images/team/peter-asingo.jpg',
  'Dr. George Wafula': '/images/team/george-wafula.png',
  'Mr. Bramwel Wambua': '/images/team/bramwel-wambua.jpg',
  'Mr. Peter Ngossi': '/images/team/peter-ngossi.jpg',
  'Mr. Julius Mala': '/images/team/julius-mala.jpg',
  'Eng. Josphat Ombui': '/images/team/josphat-ombui.jpg',
  'Mr. Ben Nyarondia': '/images/team/ben-nyarondia.png',
  'Christopher Musembi': '/images/team/christopher-musembi.jpg',
}

describe('Our Team page photography', () => {
  it('uses the real Comet Healthcare portrait for every team member', async () => {
    render(
      <MemoryRouter initialEntries={['/team']}>
        <App />
      </MemoryRouter>
    )

    await screen.findByRole('heading', { name: /^our team$/i, level: 1 }, { timeout: 30000 })

    for (const [name, src] of Object.entries(EXPECTED_PORTRAITS)) {
      expect(screen.getByAltText(name)).toHaveAttribute('src', src)
    }
  })
})
