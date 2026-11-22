import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, MapPin, SlidersHorizontal, X } from 'lucide-react'
import { api } from '../lib/api.js'
import PageHero from '../components/PageHero.jsx'
import ExpertCard from '../components/ExpertCard.jsx'
import { Select, Input } from '../components/ui/Field.jsx'
import Button from '../components/ui/Button.jsx'
import { SkeletonBlock } from '../components/ui/SmartImage.jsx'
import { ArrowRight } from 'lucide-react'
import Story from '../components/experts/Story.jsx'
import Purpose from '../components/experts/Purpose.jsx'
import HowWeWork from '../components/experts/HowWeWork.jsx'
import MissionVision from '../components/experts/MissionVision.jsx'
import Services from '../components/experts/Services.jsx'
import Leadership from '../components/experts/Leadership.jsx'
import ExpertCTA from '../components/experts/ExpertCTA.jsx'
import { getImages, getWebp } from '../components/experts/data.js'
import { useMedia } from '../context/ContentContext.jsx'

const PAGE_SIZE = 12

export default function Experts() {
  const media = useMedia()
  const IMAGES = getImages(media)
  const WEBP = getWebp(media)
  const [query, setQuery] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [location, setLocation] = useState('')
  const [options, setOptions] = useState({ specialties: [], locations: [] })
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const searchTimer = useRef()

  // Keep filter options cached from the first response.
  const syncOptions = useCallback((meta) => {
    setOptions((prev) =>
      prev.specialties.length || prev.locations.length
        ? prev
        : { specialties: meta.specialties || [], locations: meta.locations || [] }
    )
  }, [])

  useEffect(() => {
    return () => clearTimeout(searchTimer.current)
  }, [])

  useEffect(() => {
    setLoading(true)
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
      if (query.trim()) params.set('q', query.trim())
      if (specialty) params.set('specialty', specialty)
      if (location) params.set('location', location)

      api
        .get(`/providers?${params.toString()}`)
        .then((res) => {
          setItems(res.items)
          setTotal(res.total)
          syncOptions(res.meta)
          setError('')
        })
        .catch(() => setError('Could not load the expert directory. Please try again.'))
        .finally(() => setLoading(false))
    }, 150)
    return () => clearTimeout(timer)
  }, [query, specialty, location, page, syncOptions])

  // Reset page when filters change.
  const requestFilterChange = (setter) => (value) => {
    setter(value)
    setPage(1)
  }

  const hasFilters = query.trim() || specialty || location
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <PageHero
        eyebrow="About Comet · Expert Directory"
        title="Senior specialists, ready to consult"
        lead="Regulatory, CDMO, quality, R&D, training and partnerships — meet the people and the 20-year GMP heritage behind Comet's manufacturing reputation."
        image={IMAGES.facility}
        imageWebp={WEBP.facility}
        imageAlt="Comet Healthcare pharmaceutical manufacturing facility"
      >
        <Button to="/book" size="lg">
          Book a consultation <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </PageHero>

      <Story />
      <Purpose />
      <HowWeWork />
      <MissionVision />
      <Services />
      <Leadership />

      <section id="expert-directory" className="scroll-mt-24 bg-cream py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10 max-w-2xl">
            <span className="eyebrow">Consult our experts</span>
            <h2 className="mt-3 font-heading text-3xl font-extrabold leading-tight tracking-[-0.03em] text-ink sm:text-4xl">
              Find the specialist for your question
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate sm:text-[15px]">
              Search the team behind Comet&apos;s quality, regulatory and manufacturing reputation — then book a direct consultation.
            </p>
          </div>

          {/* Filter bar */}
          <div className="card p-4 sm:p-5 mb-10 relative z-10">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <label className="sm:col-span-2 lg:col-span-2">
                <span className="label">
                  <Search size={13} className="inline mr-1 text-primary" aria-hidden="true" /> Search
                </span>
                <Input
                  type="search"
                  placeholder="Name, specialty, keyword…"
                  value={query}
                  onChange={(e) => requestFilterChange(setQuery)(e.target.value)}
                  aria-label="Search experts"
                />
              </label>
              <label>
                <span className="label">
                  <SlidersHorizontal size={13} className="inline mr-1 text-primary" aria-hidden="true" /> Specialty
                </span>
                <Select value={specialty} onChange={(e) => requestFilterChange(setSpecialty)(e.target.value)} aria-label="Filter by specialty">
                  <option value="">All specialties</option>
                  {options.specialties.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </label>
              <label>
                <span className="label">
                  <MapPin size={13} className="inline mr-1 text-primary" aria-hidden="true" /> Location
                </span>
                <Select value={location} onChange={(e) => requestFilterChange(setLocation)(e.target.value)} aria-label="Filter by location">
                  <option value="">All locations</option>
                  {options.locations.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </Select>
              </label>
            </div>
            {hasFilters && (
              <div className="mt-3 flex justify-between items-center">
                <p className="text-sm text-slate" role="status">
                  {total} {total === 1 ? 'expert' : 'experts'} match your filters
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQuery('')
                    setSpecialty('')
                    setLocation('')
                    setPage(1)
                  }}
                >
                  <X size={14} aria-hidden="true" /> Clear filters
                </Button>
              </div>
            )}
          </div>

          {error && (
            <div role="alert" className="mb-8">
              <p className="text-sm text-danger bg-danger-light border border-danger/20 rounded-xl px-4 py-3">{error}</p>
            </div>
          )}

          {/* Directory grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5" aria-busy={loading}>
            {loading
              ? Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <div key={i} className="card p-6 space-y-3">
                    <div className="flex gap-4">
                      <SkeletonBlock className="w-16 h-16 rounded-xl" />
                      <div className="flex-1 space-y-2">
                        <SkeletonBlock className="h-4 w-4/5" />
                        <SkeletonBlock className="h-3 w-3/5" />
                        <SkeletonBlock className="h-5 w-28 rounded-full" />
                      </div>
                    </div>
                    <SkeletonBlock className="h-3 w-full" />
                    <SkeletonBlock className="h-3 w-2/3" />
                  </div>
                ))
              : items.map((expert) => <ExpertCard key={expert.id} expert={expert} />)}
          </div>

          {!loading && items.length === 0 && (
            <p className="text-center text-slate py-12">No experts match those filters yet.</p>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <nav className="mt-12 flex items-center justify-center gap-2" aria-label="Pagination">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <span className="px-3 text-sm text-slate" aria-live="polite">
                Page {page} of {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Next
              </Button>
            </nav>
          )}
        </div>
      </section>

      <ExpertCTA />
    </>
  )
}