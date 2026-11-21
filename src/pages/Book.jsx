import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowRight, CalendarCheck2, CalendarDays, CheckCircle2, ChevronLeft,
  ChevronRight, Clock, MapPin, Search, Star, UserCircle2,
} from 'lucide-react'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { useContent, useMedia } from '../context/ContentContext.jsx'
import PageHero from '../components/PageHero.jsx'
import Button from '../components/ui/Button.jsx'
import { Field, Input, Select, Textarea } from '../components/ui/Field.jsx'
import Alert from '../components/ui/Alert.jsx'
import { SkeletonBlock } from '../components/ui/SmartImage.jsx'
import { Icon } from '../lib/icons.jsx'
import { Reveal, Stagger, StaggerItem } from '../components/home/motion.jsx'
import { addDays, localIsoDay } from '../lib/dates.js'
import usePageMeta from '../lib/usePageMeta.js'
import { canonicalizeProvider, findExpertProfile } from '../lib/experts.js'
import { photoSrc, photoWebp } from '../lib/media.js'
import {
  BOOKING_TYPES, FALLBACK_BOOK_EXPERTS, resolveBookContent,
} from '../components/book/content.js'

const WINDOW_DAYS = 14
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const STEPS = { expert: 1, time: 2, details: 3, done: 4 }

function fmtDay(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return { weekday: WEEKDAYS[date.getDay()], day: d, month: date.toLocaleString('en', { month: 'short' }) }
}

function registryImage(media, key, custom) {
  const fallbackKey = key || 'facility.story'
  const registrySrc = photoSrc(media, fallbackKey)
  return {
    src: custom || registrySrc,
    webp: custom && custom !== registrySrc ? '' : photoWebp(media, fallbackKey),
  }
}

export default function Book() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { push } = useToast()
  const { site } = useContent()
  const media = useMedia()

  const content = useMemo(() => resolveBookContent(site), [site])
  usePageMeta(content.seo)

  // ---- data ----
  const [experts, setExperts] = useState(FALLBACK_BOOK_EXPERTS)
  const [expertsLoading, setExpertsLoading] = useState(true)
  const [provider, setProvider] = useState(null)
  const [daySlots, setDaySlots] = useState({})
  const [dates] = useState(() => Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(localIsoDay(), i)))

  // ---- flow state ----
  const [step, setStep] = useState(slug ? STEPS.time : STEPS.expert)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')
  const [bookingRef, setBookingRef] = useState(null)
  const [slotsVersion, setSlotsVersion] = useState(0)
  const [query, setQuery] = useState('')

  const [form, setForm] = useState({
    patientName: '',
    patientEmail: '',
    patientPhone: '',
    company: '',
    type: BOOKING_TYPES[0],
    notes: '',
  })
  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const visibleExperts = useMemo(
    () => experts.map((item) => canonicalizeProvider(item, media)),
    [experts, media]
  )
  const activeProvider = useMemo(() => canonicalizeProvider(provider, media), [provider, media])
  const filteredExperts = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return visibleExperts
    return visibleExperts.filter((expert) =>
      `${expert.name} ${expert.title} ${expert.specialty}`.toLowerCase().includes(term)
    )
  }, [visibleExperts, query])

  // Load expert list (for the picker), with real Comet profiles as a fallback.
  useEffect(() => {
    let active = true
    api
      .get('/providers?pageSize=50')
      .then((res) => {
        if (!active) return
        const items = Array.isArray(res.items) ? res.items : []
        setExperts(items.length ? items : FALLBACK_BOOK_EXPERTS)
      })
      .catch(() => {
        if (!active) return
        setExperts(FALLBACK_BOOK_EXPERTS)
        setServerError('Live availability is temporarily unavailable. Specialist profiles are shown below.')
      })
      .finally(() => active && setExpertsLoading(false))
    return () => { active = false }
  }, [])

  const selectProvider = useCallback(
    (selected) => {
      setProvider(selected)
      setStep(STEPS.time)
      setSelectedDate(null)
      setSelectedSlot(null)
      setDaySlots({})
      if (slug !== selected.slug) navigate(`/book/${selected.slug}`, { replace: true })
    },
    [slug, navigate]
  )

  // Load provider when a slug is present (deep link).
  useEffect(() => {
    if (!slug) {
      setProvider(null)
      setStep(STEPS.expert)
      return
    }
    let active = true
    setProvider(null)
    setExpertsLoading(true)
    api
      .get(`/providers/${slug}`)
      .then((res) => {
        if (!active) return
        setProvider(res.provider)
        setStep(STEPS.time)
        if (user) {
          setForm((f) => ({
            ...f,
            patientName: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : f.patientName,
            patientEmail: user.email || f.patientEmail,
            patientPhone: user.phone || f.patientPhone,
            company: user.company || f.company,
          }))
        }
      })
      .catch(() => {
        if (!active) return
        const profile = findExpertProfile(slug)
        if (profile) {
          setProvider({ ...profile, id: slug, active: true })
          setStep(STEPS.time)
          setServerError('Live availability is temporarily unavailable for this specialist.')
        } else {
          setStep(STEPS.expert)
          setServerError('We could not find that specialist — please pick one below.')
        }
      })
      .finally(() => active && setExpertsLoading(false))
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // Fetch availability for every day in the window once an expert is chosen.
  useEffect(() => {
    if (!provider) return undefined
    let active = true
    setDaySlots({})
    setSelectedDate(null)
    setSelectedSlot(null)
    Promise.all(
      dates.map(async (date) => {
        const res = await api.get(`/providers/${provider.slug}/slots?date=${date}`)
        return [date, res.slots || []]
      })
    )
      .then((entries) => {
        if (!active) return
        const map = Object.fromEntries(entries)
        setDaySlots(map)
        const first = dates.find((d) => (map[d] || []).some((s) => s.available))
        if (first) setSelectedDate(first)
      })
      .catch(() => setServerError('We could not load availability. Please try again.'))
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, slotsVersion])

  // Keep the consultation type valid if the CMS list changes.
  useEffect(() => {
    if (content.types.length && !content.types.includes(form.type)) {
      setForm((f) => ({ ...f, type: content.types[0] }))
    }
  }, [content.types, form.type])

  const availableSlots = useMemo(() => {
    if (!selectedDate) return []
    return (daySlots[selectedDate] || []).filter((s) => s.available)
  }, [daySlots, selectedDate])

  const busyCounts = useMemo(() => {
    const counts = {}
    for (const [date, slots] of Object.entries(daySlots)) {
      counts[date] = slots.filter((s) => s.available).length
    }
    return counts
  }, [daySlots])

  const goBack = () => {
    if (step === STEPS.details) {
      setStep(STEPS.time)
    } else if (step === STEPS.time) {
      setStep(STEPS.expert)
      navigate('/book')
    }
  }

  function selectTopic(topic) {
    const specialist = visibleExperts.find((item) => item.slug === topic.slug)
    setForm((f) => ({ ...f, type: `${topic.title} consultation` }))
    if (specialist) {
      selectProvider(specialist)
      document.getElementById('specialists')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  async function submitBooking(e) {
    e.preventDefault()
    setServerError('')
    setSubmitting(true)
    try {
      const { appointment } = await api.post('/appointments', {
        providerSlug: activeProvider.slug,
        date: selectedDate,
        startTime: selectedSlot.start,
        type: form.type,
        patientName: form.patientName,
        patientEmail: form.patientEmail,
        patientPhone: form.patientPhone,
        company: form.company,
        notes: form.notes,
      })
      push(`Consultation booked — reference ${appointment.code}`, 'success')
      setBookingRef(appointment.code)
      setStep(STEPS.done)
      setForm((f) => ({ ...f, notes: '' }))
    } catch (err) {
      if (err.status === 409) setSlotsVersion((v) => v + 1)
      setServerError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const heroImage = registryImage(media, content.hero.imageKey, content.hero.image)
  const trustImage = registryImage(media, content.trust.imageKey, content.trust.image)

  const breadcrumb = (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate">
      <Link to="/" className="transition-colors hover:text-primary">Home</Link>
      <ChevronRight size={13} className="text-primary/50" aria-hidden="true" />
      <span aria-current="page" className="text-primary">{content.hero.title}</span>
    </nav>
  )

  // ---------------------------------------------------------------- rendering
  if (step === STEPS.done) {
    return (
      <section className="flex min-h-[60vh] items-center justify-center bg-cream py-24">
        <div className="mx-auto w-full max-w-lg px-4 text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 animate-toast-in items-center justify-center rounded-full bg-success-light">
            <CalendarCheck2 size={38} className="text-success" aria-hidden="true" />
          </div>
          <h1 className="mb-3 font-heading text-3xl font-bold text-ink">Consultation booked</h1>
          <p className="leading-relaxed text-slate mb-2">
            We've sent a confirmation to <strong className="text-ink">{form.patientEmail}</strong>.
            Keep this reference: <strong className="text-primary">{bookingRef ?? 'CMT-…'}</strong>
          </p>
          <div className="card mt-6 space-y-1.5 p-5 text-left text-sm">
            <div className="flex justify-between"><span className="text-slate">Specialist</span><span className="font-semibold text-ink">{activeProvider?.name}</span></div>
            <div className="flex justify-between"><span className="text-slate">Date</span><span className="font-semibold text-ink">{selectedDate}</span></div>
            <div className="flex justify-between"><span className="text-slate">Time</span><span className="font-semibold text-ink">{selectedSlot?.start} – {selectedSlot?.end}</span></div>
            <div className="flex justify-between"><span className="text-slate">Type</span><span className="font-semibold text-ink">{form.type}</span></div>
          </div>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button to="/portal">Manage in your portal</Button>
            <Button to="/experts" variant="outline">Book another</Button>
          </div>
        </div>
      </section>
    )
  }

  const dateStrip = (
    <div className="-mx-2 flex gap-2 overflow-x-auto px-2 pb-2" role="list" aria-label="Pick a date">
      {dates.map((date) => {
        const avail = busyCounts[date]
        const label = fmtDay(date)
        const disabled = !avail
        const selected = date === selectedDate
        return (
          <button
            key={date}
            type="button"
            role="listitem"
            disabled={disabled}
            aria-pressed={selected}
            aria-label={`${label.weekday}, ${label.month} ${label.day}${disabled ? ' (no availability)' : ` (${avail} slots)`}`}
            onClick={() => {
              setSelectedDate(date)
              setSelectedSlot(null)
            }}
            className={`flex w-16 shrink-0 flex-col items-center justify-center rounded-xl border py-2.5 transition-all duration-200 ${
              disabled
                ? 'cursor-not-allowed border-mist/60 bg-cream/70 text-slate/40'
                : selected
                  ? 'border-primary bg-primary text-white shadow-[0_10px_20px_-8px_rgba(20,71,135,0.5)]'
                  : 'cursor-pointer border-mist bg-white text-ink hover:border-primary hover:bg-primary-50'
            }`}
          >
            <span className="text-[10px] uppercase tracking-wide">{label.weekday}</span>
            <span className="font-heading text-lg font-bold leading-tight">{label.day}</span>
            <span className="text-[10px]">{label.month}</span>
            {avail !== undefined && (
              <span className={`text-[10px] font-semibold ${disabled ? 'text-slate/40' : selected ? 'text-white/80' : 'text-primary'}`}>
                {avail} {avail === 1 ? 'slot' : 'slots'}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )

  return (
    <>
      <PageHero
        eyebrow={content.hero.eyebrow}
        title={content.hero.title}
        lead={content.hero.lead}
        image={heroImage.src}
        imageWebp={heroImage.webp}
        imageAlt="Comet Healthcare manufacturing facility in Machakos"
        breadcrumb={breadcrumb}
      >
        <Button href="#specialists" size="lg">Browse specialists</Button>
        <Button href="#how-it-works" variant="outline" size="lg">How booking works</Button>
      </PageHero>

      <section className="border-b border-mist bg-white py-8" aria-label="Booking assurances">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-5 px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
          {content.assurances.map((item, i) => (
            <Reveal key={item.label} delay={i * 60} className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
                <Icon name={item.icon} size={19} aria-hidden="true" />
              </span>
              <span>
                <span className="block font-heading text-lg font-extrabold text-ink">{item.value}</span>
                <span className="block text-xs leading-snug text-slate">{item.label}</span>
              </span>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Consultation topics */}
      <section id="topics" className="scroll-mt-32 bg-cream py-16 lg:py-24" aria-labelledby="book-topics-title">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="max-w-3xl">
            <span className="eyebrow">Consultation topics</span>
            <h2 id="book-topics-title" className="mt-4 font-heading text-3xl font-extrabold tracking-[-0.03em] text-ink sm:text-4xl">
              Start with the outcome you need
            </h2>
            <p className="mt-4 leading-relaxed text-slate">
              Each topic routes you to the specialist who owns that discipline. Pick one to pre-fill your consultation type and jump straight to their live availability.
            </p>
          </Reveal>

          <Stagger className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {content.topics.map((topic, i) => {
              const image = registryImage(media, topic.photoKey, topic.image)
              return (
                <StaggerItem key={`${topic.title}-${i}`}>
                  <button
                    type="button"
                    onClick={() => selectTopic(topic)}
                    className="card card-hover group h-full w-full overflow-hidden text-left"
                    aria-label={`Book a consultation about ${topic.title}`}
                  >
                    <div className="relative h-28 overflow-hidden">
                      <picture className="contents">
                        {image.webp && <source type="image/webp" srcSet={image.webp} />}
                        <img src={image.src} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      </picture>
                      <span className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white/90 text-primary shadow-sm backdrop-blur">
                        <Icon name={topic.icon} size={19} aria-hidden="true" />
                      </span>
                    </div>
                    <div className="p-5">
                      <h3 className="font-heading text-base font-bold text-ink">{topic.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate">{topic.desc}</p>
                      <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary group-hover:gap-2.5 transition-all">
                        Book this topic <ArrowRight size={13} aria-hidden="true" />
                      </span>
                    </div>
                  </button>
                </StaggerItem>
              )
            })}
          </Stagger>
        </div>
      </section>

      {/* Booking wizard */}
      <section id="specialists" className="scroll-mt-32 bg-white py-16 lg:py-24" aria-labelledby="book-wizard-title">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <Reveal className="mb-8 max-w-2xl">
            <span className="eyebrow">Live scheduling</span>
            <h2 id="book-wizard-title" className="mt-4 font-heading text-3xl font-extrabold tracking-[-0.03em] text-ink sm:text-4xl">
              Book your consultation
            </h2>
            <p className="mt-4 leading-relaxed text-slate">
              Three quick steps: choose a specialist, pick a live slot, then add a short brief so we come prepared.
            </p>
          </Reveal>

          <nav className="mb-8 flex items-center gap-2 text-sm" aria-label="Booking progress">
            {[
              { n: STEPS.expert, label: 'Specialist' },
              { n: STEPS.time, label: 'Time' },
              { n: STEPS.details, label: 'Your details' },
            ].map((item, i) => (
              <span key={item.n} className="flex items-center gap-2">
                {i > 0 && <ChevronRight size={14} className="text-mist" aria-hidden="true" />}
                <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 ${
                  step >= item.n ? 'bg-primary text-white' : 'border border-mist bg-white text-slate'
                }`}>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${step >= item.n ? 'bg-white/20' : 'bg-cream text-slate'}`}>
                    {item.n}
                  </span>
                  {item.label}
                </span>
              </span>
            ))}
          </nav>

          {serverError && <div className="mb-6"><Alert type="error">{serverError}</Alert></div>}

          {/* STEP 1 — choose expert */}
          {step === STEPS.expert && (
            <div className="card p-6 sm:p-8">
              <h3 className="font-heading text-xl font-bold text-ink mb-1.5">Choose a specialist</h3>
              <p className="mb-6 text-sm text-slate">Every consultant is a senior member of the Comet team, not an anonymous advisor.</p>

              <div className="relative mb-6">
                <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate" aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, role or discipline"
                  aria-label="Search specialists"
                  className="input !pl-10"
                />
              </div>

              {expertsLoading ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-24 w-full" />)}
                </div>
              ) : filteredExperts.length === 0 ? (
                <p className="rounded-xl border border-mist bg-cream/60 p-5 text-sm text-slate">
                  No specialist matches that search. Try a broader term or contact us for a recommendation.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {filteredExperts.map((expert) => {
                    const active = activeProvider?.id === expert.id
                    return (
                      <button
                        key={expert.id}
                        type="button"
                        onClick={() => selectProvider(expert)}
                        aria-pressed={active}
                        className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all duration-200 ${
                          active
                            ? 'border-primary bg-primary-50 ring-2 ring-primary/20'
                            : 'cursor-pointer border-mist bg-white hover:border-primary hover:shadow-card'
                        }`}
                      >
                        <img src={expert.image} alt={`Portrait of ${expert.name}`} className="h-14 w-14 shrink-0 rounded-xl object-cover" loading="lazy" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink">{expert.name}</span>
                          <span className="block truncate text-xs text-slate">{expert.title}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate">
                            <span className="inline-flex items-center gap-1">
                              <Star size={11} className="fill-secondary text-secondary" aria-hidden="true" />
                              {Number(expert.rating || 0).toFixed(1)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin size={11} className="text-primary" aria-hidden="true" />{expert.location}
                            </span>
                          </span>
                        </span>
                        <CheckCircle2 size={18} className={active ? 'text-primary' : 'text-mist'} aria-hidden="true" />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* STEP 2 — pick date & time */}
          {step === STEPS.time && activeProvider && (
            <div className="space-y-6">
              <div className="card p-6 sm:p-8">
                <div className="mb-6 flex items-start gap-4">
                  <img src={activeProvider.image} alt={`Portrait of ${activeProvider.name}`} className="h-16 w-16 rounded-xl object-cover" loading="lazy" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-heading text-xl font-bold text-ink">{activeProvider.name}</h3>
                    <p className="text-sm text-slate">{activeProvider.title}</p>
                    <p className="mt-1 text-xs font-semibold text-primary">{activeProvider.specialty}</p>
                  </div>
                  <button type="button" onClick={goBack} className="shrink-0 text-sm font-semibold text-primary hover:text-primary-light">
                    Change
                  </button>
                </div>

                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                  <CalendarDays size={16} className="text-primary" aria-hidden="true" /> Pick a date
                </p>
                {dateStrip}
                <p className="mt-3 text-xs text-slate">All times shown in East Africa Time (EAT). Availability refreshes automatically after each booking.</p>
              </div>

              {selectedDate && (
                <div className="card p-6 sm:p-8">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <h3 className="font-heading text-lg font-semibold text-ink">
                      Times on {fmtDay(selectedDate).weekday}, {fmtDay(selectedDate).month} {selectedDate.slice(8)}
                    </h3>
                    <span className="text-xs text-slate" role="status">{availableSlots.length} available</span>
                  </div>
                  {availableSlots.length === 0 ? (
                    <p className="text-sm text-slate">No more availability that day — try another date in the strip.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
                      {availableSlots.map((slot) => {
                        const active = selectedSlot?.start === slot.start
                        return (
                          <button
                            key={slot.start}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setSelectedSlot(active ? null : slot)}
                            className={`slot-btn ${active ? 'slot-sel' : 'slot-avail'}`}
                          >
                            {slot.start}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="ghost" onClick={goBack}><ChevronLeft size={15} aria-hidden="true" /> Back</Button>
                <Button disabled={!selectedSlot} onClick={() => setStep(STEPS.details)}>
                  Continue <ChevronRight size={15} aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3 — details */}
          {step === STEPS.details && activeProvider && selectedSlot && (
            <form onSubmit={submitBooking} className="card space-y-5 p-6 sm:p-8" noValidate>
              <Alert type="info">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} aria-hidden="true" /><strong>{selectedDate}</strong></span>
                  <span className="inline-flex items-center gap-1.5"><Clock size={15} aria-hidden="true" /><strong>{selectedSlot.start} – {selectedSlot.end} (EAT)</strong></span>
                  <span className="inline-flex items-center gap-1.5"><UserCircle2 size={15} aria-hidden="true" /><strong>{activeProvider.name}</strong></span>
                </div>
              </Alert>

              {user && (
                <p className="flex items-center gap-1.5 text-xs text-slate">
                  <CheckCircle2 size={13} className="text-success" aria-hidden="true" />
                  Signed in as {user.email} — this booking will appear in your portal.
                </p>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" htmlFor="bk-name" required>
                  <Input id="bk-name" required value={form.patientName} onChange={setField('patientName')} placeholder="Jane Doe" autoComplete="name" />
                </Field>
                <Field label="Work email" htmlFor="bk-email" required>
                  <Input id="bk-email" type="email" required value={form.patientEmail} onChange={setField('patientEmail')} placeholder="you@company.com" autoComplete="email" />
                </Field>
                <Field label="Phone" htmlFor="bk-phone" hint="Optional, but recommended for urgent scheduling.">
                  <Input id="bk-phone" type="tel" value={form.patientPhone} onChange={setField('patientPhone')} placeholder="+254 7xx xxx xxx" autoComplete="tel" />
                </Field>
                <Field label="Company / organisation" htmlFor="bk-company">
                  <Input id="bk-company" value={form.company} onChange={setField('company')} placeholder="Acme Pharma Ltd" />
                </Field>
              </div>

              <Field label="Consultation type" htmlFor="bk-type">
                <Select id="bk-type" value={form.type} onChange={setField('type')}>
                  {content.types.map((type) => <option key={type} value={type}>{type}</option>)}
                </Select>
              </Field>

              <Field label="What would you like to cover?" htmlFor="bk-notes">
                <Textarea id="bk-notes" rows={4} value={form.notes} onChange={setField('notes')} placeholder="Brief context helps us prepare — product, stage, geography, timelines…" />
              </Field>

              {serverError && <Alert type="error">{serverError}</Alert>}

              <div className="flex flex-col-reverse justify-between gap-3 pt-2 sm:flex-row">
                <Button type="button" variant="ghost" onClick={goBack} disabled={submitting}>
                  <ChevronLeft size={15} aria-hidden="true" /> Back to times
                </Button>
                <Button type="submit" size="lg" loading={submitting}>
                  Confirm booking <CalendarCheck2 size={17} aria-hidden="true" />
                </Button>
              </div>
            </form>
          )}

          <p className="mt-6 text-center text-xs text-slate">
            Need something less structured? <Link to="/contact" className="font-semibold text-primary hover:underline">Send us an inquiry</Link> instead.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-32 bg-cream py-16 lg:py-24" aria-labelledby="book-process-title">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="max-w-3xl">
            <span className="eyebrow">How it works</span>
            <h2 id="book-process-title" className="mt-4 font-heading text-3xl font-extrabold tracking-[-0.03em] text-ink sm:text-4xl">
              A clear path from question to next step
            </h2>
            <p className="mt-4 leading-relaxed text-slate">
              No sales funnel and no vague hand-offs. You get a named specialist, a confirmed slot and a written summary you can act on.
            </p>
          </Reveal>

          <Stagger className="mt-10 grid gap-5 md:grid-cols-3">
            {content.process.map((item, i) => (
              <StaggerItem key={`${item.step}-${i}`}>
                <div className="card h-full p-6">
                  <span className="font-heading text-4xl font-extrabold text-primary/20">{item.step}</span>
                  <h3 className="mt-3 font-heading text-lg font-bold text-ink">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate">{item.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Trust / why Comet */}
      <section className="bg-white py-16 lg:py-24" aria-labelledby="book-trust-title">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-white/80 bg-white/70 p-2 shadow-card">
              <picture className="contents">
                {trustImage.webp && <source type="image/webp" srcSet={trustImage.webp} />}
                <img src={trustImage.src} alt="Comet Healthcare quality and manufacturing team at work" className="h-80 w-full rounded-2xl object-cover" loading="lazy" />
              </picture>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <span className="eyebrow">{content.trust.eyebrow}</span>
            <h2 id="book-trust-title" className="mt-4 font-heading text-3xl font-extrabold tracking-[-0.03em] text-ink sm:text-4xl">
              {content.trust.title}
            </h2>
            <p className="mt-4 leading-relaxed text-slate">{content.trust.lead}</p>
            <div className="mt-8 space-y-5">
              {content.trustPoints.map((point, i) => (
                <div key={`${point.title}-${i}`} className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
                    <Icon name={point.icon} size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-heading text-base font-bold text-ink">{point.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate">{point.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Expectations + FAQ */}
      <section className="bg-cream py-16 lg:py-24" aria-labelledby="book-expect-title">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <Reveal>
            <span className="eyebrow">What to expect</span>
            <h2 id="book-expect-title" className="mt-4 font-heading text-3xl font-extrabold tracking-[-0.03em] text-ink sm:text-4xl">
              A useful conversation, not a sales call
            </h2>
            <ul className="mt-8 space-y-4">
              {content.expectations.map((point, i) => (
                <li key={`${point}-${i}`} className="flex gap-3 text-sm leading-relaxed text-slate">
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <Button href="#specialists" size="lg">See live availability <CalendarDays size={16} aria-hidden="true" /></Button>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <span className="eyebrow">FAQ</span>
            <h2 id="book-faq-title" className="mt-4 font-heading text-3xl font-extrabold tracking-[-0.03em] text-ink sm:text-4xl">
              Frequently asked questions
            </h2>
            <div className="mt-8 space-y-3">
              {content.faqs.map((item, i) => (
                <details key={`${item.q}-${i}`} className="group rounded-xl border border-mist bg-white p-4 open:border-primary/30">
                  <summary className="cursor-pointer font-heading text-sm font-bold text-ink marker:text-primary">{item.q}</summary>
                  <p className="mt-3 text-sm leading-relaxed text-slate">{item.a}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-gradient-to-br from-primary-deeper via-primary-dark to-primary py-14 text-white" aria-labelledby="book-cta-title">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 sm:px-6 lg:flex-row lg:items-center lg:px-8">
          <div>
            <h2 id="book-cta-title" className="font-heading text-2xl font-extrabold sm:text-3xl">Still not sure who to book?</h2>
            <p className="mt-2 max-w-2xl text-sm text-white/80">
              Tell us the challenge in a short message and we will point you to the right specialist — or explore the full team and their disciplines first.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button to="/contact" variant="outlineLight" size="lg">Ask us a question</Button>
            <Button to="/experts" variant="outlineLight" size="lg">Meet all experts</Button>
          </div>
        </div>
      </section>
    </>
  )
}
