import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MapPin, Star, Phone, Mail, CalendarDays, Clock, ChevronLeft, BadgeCheck } from 'lucide-react'
import { api } from '../lib/api.js'
import { useMedia } from '../context/ContentContext.jsx'
import { canonicalizeProvider } from '../lib/experts.js'
import PageHero from '../components/PageHero.jsx'
import Button from '../components/ui/Button.jsx'
import Badge from '../components/ui/Badge.jsx'
import { SkeletonBlock, SkeletonText } from '../components/ui/SmartImage.jsx'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function scheduleLabel(schedules) {
  if (!schedules.length) return 'Currently reviewing schedules'
  const sorted = [...schedules].sort((a, b) => a.dayOfWeek - b.dayOfWeek)
  return sorted.map((s) => `${DAY_NAMES[s.dayOfWeek].slice(0, 3)} ${s.startTime}–${s.endTime}`).join(' · ')
}

export default function ExpertProfile() {
  const { slug } = useParams()
  const [provider, setProvider] = useState(null)
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const media = useMedia()
  const person = useMemo(() => canonicalizeProvider(provider, media), [provider, media])

  useEffect(() => {
    setLoading(true)
    setError('')
    api
      .get(`/providers/${slug}`)
      .then((res) => {
        setProvider(res.provider)
        setSchedules(res.schedules)
      })
      .catch(() => setError('Expert not found.'))
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 space-y-6">
        <SkeletonBlock className="h-5 w-40" />
        <SkeletonBlock className="h-16 w-72" />
        <SkeletonText lines={4} className="max-w-xl" />
      </div>
    )
  }

  if (error || !person) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold text-ink mb-3">{error || 'Not found'}</h1>
        <Button to="/experts" variant="outline">
          <ChevronLeft size={16} aria-hidden="true" /> Back to experts
        </Button>
      </div>
    )
  }

  return (
    <>
      <PageHero
        eyebrow="Expert Profile"
        title={person.name}
        lead={`${person.title} · ${person.specialty}`}
      >
        <Button to={`/book/${person.slug}`} size="lg">
          <CalendarDays size={17} aria-hidden="true" /> Book a consultation
        </Button>
        <Button to="/experts" variant="outlineLight" size="lg">
          <ChevronLeft size={16} aria-hidden="true" /> All experts
        </Button>
      </PageHero>

      <section className="py-16 lg:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-10">
            <div className="space-y-6">
              {/* Portrait card */}
              <div className="card p-6 sticky top-24">
                <div className="rounded-2xl overflow-hidden mb-5">
                  <img src={person.image} alt={`Portrait of ${person.name}`} className="w-full h-72 object-cover" loading="lazy" />
                </div>
                <dl className="space-y-3.5 text-sm">
                  <div className="flex items-start gap-3">
                    <MapPin size={17} className="text-primary mt-0.5 shrink-0" aria-hidden="true" />
                    <div>
                      <dt className="text-xs text-slate uppercase tracking-wide">Location</dt>
                      <dd className="font-semibold text-ink">{person.location}</dd>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Star size={17} className="text-secondary mt-0.5 shrink-0" aria-hidden="true" />
                    <div>
                      <dt className="text-xs text-slate uppercase tracking-wide">Rating</dt>
                      <dd className="font-semibold text-ink">
                        {Number(person.rating).toFixed(1)} · {person.reviewsCount} consultations
                      </dd>
                    </div>
                  </div>
                  {person.phone && (
                    <div className="flex items-start gap-3">
                      <Phone size={17} className="text-primary mt-0.5 shrink-0" aria-hidden="true" />
                      <a href={`tel:${person.phone}`} className="font-semibold text-ink hover:text-primary">{person.phone}</a>
                    </div>
                  )}
                  {person.email && (
                    <div className="flex items-start gap-3">
                      <Mail size={17} className="text-primary mt-0.5 shrink-0" aria-hidden="true" />
                      <a href={`mailto:${person.email}`} className="font-semibold text-ink hover:text-primary break-all">{person.email}</a>
                    </div>
                  )}
                  <div className="flex items-start gap-3">
                    <Clock size={17} className="text-primary mt-0.5 shrink-0" aria-hidden="true" />
                    <div>
                      <dt className="text-xs text-slate uppercase tracking-wide">Availability</dt>
                      <dd className="font-semibold text-ink leading-relaxed">{scheduleLabel(schedules)}</dd>
                    </div>
                  </div>
                </dl>
                <Button to={`/book/${person.slug}`} block size="md" className="mt-6">
                  Book a consultation
                </Button>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-8">
              <div className="card p-8">
                <div className="flex flex-wrap items-center gap-3 mb-5">
                  <h2 className="font-heading text-2xl font-bold text-ink">About {person.name.split(' ')[0]}</h2>
                  <Badge tone="primary">{person.specialty}</Badge>
                  <Badge tone="success">
                    <BadgeCheck size={13} aria-hidden="true" /> {person.yearsExperience}+ years
                  </Badge>
                </div>
                <p className="text-slate leading-relaxed">{person.bio}</p>
              </div>

              <div className="card p-8">
                <h2 className="font-heading text-2xl font-bold text-ink mb-4">What to expect</h2>
                <ul className="space-y-3">
                  {[
                    'A focused consultation on your product, programme or compliance question.',
                    'Straight answers grounded in real manufacturing and regulatory practice.',
                    'A clear written follow-up and next steps — no obligation to proceed.',
                  ].map((point) => (
                    <li key={point} className="flex items-start gap-3 text-slate text-sm leading-relaxed">
                      <CalendarDays size={16} className="text-primary shrink-0 mt-0.5" aria-hidden="true" />
                      {point}
                    </li>
                  ))}
                </ul>
                <div className="mt-7 pt-6 border-t border-mist/70">
                  <Link to={`/book/${person.slug}`} className="link-underline">
                    See live availability and book <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}