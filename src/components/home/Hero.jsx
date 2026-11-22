import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  ArrowRight, ArrowUpRight, PlayCircle, ShieldCheck, BadgeCheck, Sparkles,
  ChevronDown, ChevronLeft, ChevronRight, Users,
} from 'lucide-react'
import Button from '../ui/Button.jsx'
import { Reveal, Stagger, StaggerItem } from './motion.jsx'
import { HERO_IMAGES } from './data.js'
import { useMedia } from '../../context/ContentContext.jsx'
import { gallerySlide, photoSrc } from '../../lib/media.js'

const BADGE_ICONS = [ShieldCheck, BadgeCheck, Sparkles, BadgeCheck]

const DEFAULT_CTAS = {
  primary: { label: 'Book a Consultation', to: '/book' },
  secondary: { label: 'Explore our services', to: '/services' },
  tertiary: { label: 'Meet our experts', to: '/experts' },
  portfolio: { label: 'Browse the product portfolio', to: '/products' },
}

export default function Hero({ content = {} }) {
  const media = useMedia()
  const [index, setIndex] = useState(0)
  const reduce = useReducedMotion()

  // Content Studio owns the slideshow. The static, curated list is only used
  // while the CMS is loading or when an admin clears the slides array.
  const slides = useMemo(
    () => (content.slides?.length ? content.slides.map((slide) => gallerySlide(slide)) : HERO_IMAGES),
    [content.slides]
  )
  const count = slides.length

  const go = useCallback((dir) => {
    setIndex((i) => (i + dir + count) % count)
  }, [count])

  useEffect(() => {
    if (reduce || count < 2) return undefined
    const id = setInterval(() => setIndex((i) => (i + 1) % count), 6500)
    return () => clearInterval(id)
  }, [reduce, count])

  // Warm the next image so every transition is instant.
  useEffect(() => {
    if (reduce) return
    const next = new Image()
    next.src = slides[(index + 1) % count].preview
  }, [index, count, reduce, slides])

  const badge = content.badge || '20+ years of GMP manufacturing · Kenya & East Africa'
  const sub = content.sub || 'From formulation and scale-up to registration and quality assurance, Comet gives you direct access to the seniors who manufacture, test and qualify medicines across East Africa.'
  const title = content.title || 'Expert guidance for the journey from'
  const highlight = (content.highlight || 'molecule to market').replace(/[.!?]+$/, '')
  const badges = content.badges?.length
    ? content.badges
    : ['GMP Certified', 'PPB Registered', '100% Batch Tested', 'East Africa']
  const ctas = { ...DEFAULT_CTAS, ...(content.ctas || {}) }
  const supportingImageKey = content.supportingImageKey || 'facility.production'
  const slide = slides[index % count]

  return (
    <section
      className="relative isolate flex min-h-[92svh] items-center overflow-hidden bg-blue-field pt-28 pb-28 sm:pt-32 lg:pt-36 lg:pb-32"
      aria-labelledby="home-hero-title"
    >
      {/* ---------- Photographic background ---------- */}
      <div className="absolute inset-0 -z-30" aria-hidden="true">
        <AnimatePresence initial={false}>
          <motion.div
            key={slide.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 1.2, ease: 'easeInOut' }}
            className="absolute inset-0"
          >
            <img
              src={slide.src}
              srcSet={slide.srcSet}
              sizes={slide.sizes}
              alt={slide.alt}
              fetchPriority={index === 0 ? 'high' : 'auto'}
              style={{ objectPosition: slide.position }}
              className="h-full w-full animate-kenburns object-cover brightness-[1.1] saturate-[1.08]"
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ---------- Blue-led veil: ~50% transparent so the facility photos show through ---------- */}
      <div className="absolute inset-0 -z-20 bg-gradient-to-r from-[#F7FBFF]/55 via-[#DCEBFF]/45 to-[#002B66]/40 sm:from-[#F7FBFF]/50 sm:via-[#DCEBFF]/40 sm:to-[#002B66]/35" aria-hidden="true" />
      <div className="absolute inset-0 -z-20 bg-gradient-to-t from-white/35 via-white/10 to-white/20" aria-hidden="true" />
      <div className="absolute inset-y-0 right-0 -z-20 hidden w-[48%] bg-gradient-to-l from-primary-deeper/40 via-primary/20 to-transparent lg:block" aria-hidden="true" />
      <div className="absolute inset-0 -z-20 bg-white/25 sm:hidden" aria-hidden="true" />
      <div className="absolute inset-0 -z-20 bg-mesh opacity-40" aria-hidden="true" />
      <div className="absolute inset-0 -z-10 bg-grid opacity-[0.12] mask-fade-b" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" aria-hidden="true" />

      {/* ---------- luminous blue accents ---------- */}
      <div className="pointer-events-none absolute -right-40 -top-16 -z-10 h-[34rem] w-[34rem] rounded-full bg-azure/30 blur-[140px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-44 bottom-0 -z-10 h-[30rem] w-[30rem] rounded-full bg-primary-strong/20 blur-[130px]" aria-hidden="true" />
      <div className="pointer-events-none absolute left-[38%] top-[18%] -z-10 h-40 w-40 rounded-full border border-primary/15 animate-orbit" aria-hidden="true" />

      <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-12 lg:gap-10">
          {/* ---------- Copy ---------- */}
          <div className="relative lg:col-span-7">
            {/* Local scrim: keeps copy legible without raising the 50% photo veil. */}
            <div className="hero-copy-scrim pointer-events-none absolute -inset-x-10 -inset-y-12 z-0 rounded-[3rem] blur-2xl sm:-inset-x-16" aria-hidden="true" />
            <div className="relative z-10">
              <Reveal>
                <span className="glass-light inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-[12px] font-bold tracking-wide text-primary shadow-card ring-1 ring-primary/10 sm:text-[13px]">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-strong opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-strong" />
                  </span>
                  {badge}
                </span>
              </Reveal>

              <Reveal delay={0.08}>
                <h1
                  id="home-hero-title"
                  className="mt-7 max-w-3xl text-[2.6rem] font-extrabold leading-[1.05] tracking-[-0.045em] text-ink sm:text-6xl lg:text-[4.5rem] xl:text-[5rem] text-balance"
                >
                  {title} <span className="text-gradient-blue">{highlight}.</span>
                </h1>
                <div className="mt-7 h-1 w-24 rounded-full bg-gradient-to-r from-primary via-primary-strong to-azure sm:w-32" aria-hidden="true" />
              </Reveal>

              <Reveal delay={0.16}>
                <p className="mt-6 max-w-xl text-base font-medium leading-relaxed text-slate sm:text-lg">
                  {sub}
                </p>
              </Reveal>

              <Reveal delay={0.24}>
                <div className="mt-9 flex flex-col gap-3.5 sm:flex-row">
                  <Button to={ctas.primary?.to || '/book'} size="lg" className="group !px-8">
                    {ctas.primary?.label || 'Book a Consultation'}
                    <ArrowRight size={18} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1" />
                  </Button>
                  <Link to={ctas.secondary?.to || '/services'} className="btn btn-outline btn-lg group !px-8 backdrop-blur-md">
                    <PlayCircle size={18} aria-hidden="true" />
                    {ctas.secondary?.label || 'Explore our services'}
                  </Link>
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
                  <Link to={ctas.tertiary?.to || '/experts'} className="group inline-flex items-center gap-1.5 text-sm font-bold text-primary transition-colors hover:text-primary-strong">
                    <Users size={16} aria-hidden="true" />
                    {ctas.tertiary?.label || 'Meet our experts'}
                    <ArrowUpRight size={14} aria-hidden="true" className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </Link>
                  <Link to={ctas.portfolio?.to || '/products'} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:text-primary-strong">
                    {ctas.portfolio?.label || 'Browse the product portfolio'} <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              </Reveal>

              <Stagger className="mt-10" delay={0.4} stagger={0.09}>
                <div className="glass-light inline-flex max-w-full flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl px-5 py-4 shadow-card ring-1 ring-primary/10">
                  {badges.map((label, i) => {
                    const Icon = BADGE_ICONS[i % BADGE_ICONS.length]
                    return (
                      <StaggerItem key={`${label}-${i}`} className="flex items-center gap-2 text-[13px] font-bold text-primary">
                        <Icon size={17} className="text-primary-strong" aria-hidden="true" />
                        {label}
                      </StaggerItem>
                    )
                  })}
                </div>
              </Stagger>
            </div>
          </div>

          {/* ---------- Visual card ---------- */}
          <div className="relative hidden lg:col-span-5 lg:block">
            <Reveal delay={0.2} y={40}>
              <div className="relative mx-auto w-full max-w-[26rem]">
                <div className="absolute -inset-8 rounded-full border border-primary/15 animate-orbit" aria-hidden="true" />
                <div className="absolute -inset-5 rounded-[2.5rem] bg-gradient-to-br from-white via-azure/25 to-primary-deeper/30 blur-2xl" aria-hidden="true" />

                <div className="relative overflow-hidden rounded-[1.8rem] border border-white/80 bg-white/70 p-2 shadow-deep backdrop-blur-xl">
                  <div className="relative overflow-hidden rounded-[1.4rem]">
                    <img
                      src={photoSrc(media, 'site.lab')}
                      alt="Scientists and analytical equipment in the Comet Healthcare quality control laboratory"
                      loading="lazy"
                      decoding="async"
                      className="aspect-[4/4.1] h-full w-full object-cover brightness-[1.1]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-primary-deeper/35 via-transparent to-transparent" aria-hidden="true" />
                    <span className="glass-deep absolute left-3 top-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-azure" />
                      Live from Machakos
                    </span>
                    <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-white/70 bg-white/92 p-4 shadow-card backdrop-blur-xl">
                      <span className="chip bg-primary-50 text-primary">Behind the science</span>
                      <p className="mt-3 font-heading text-lg font-extrabold leading-snug text-ink">
                        Quality you can see.<br />Standards you can trust.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="absolute -bottom-7 -left-10 rounded-2xl border border-primary/10 bg-white p-4 shadow-deep">
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary-strong to-primary-light text-white shadow-glow">
                      <ShieldCheck size={24} aria-hidden="true" />
                    </div>
                    <div>
                      <div className="font-heading text-2xl font-extrabold leading-none text-ink">100%</div>
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate">Batch tested</div>
                    </div>
                  </div>
                </div>

                <div className="absolute -bottom-10 -right-8 h-32 w-44 overflow-hidden rounded-2xl border-[5px] border-white shadow-deep ring-1 ring-primary/15">
                  <img
                    src={photoSrc(media, supportingImageKey)}
                    alt="Pharmaceutical production line at Comet Healthcare"
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover brightness-110"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-primary-deeper/90 to-transparent px-3 pb-2 pt-6 text-[10px] font-bold uppercase tracking-[0.16em] text-white">
                    On the floor
                  </span>
                </div>

                <div className="glass-light absolute -right-6 -top-6 rounded-2xl px-4 py-3 shadow-deep">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary">
                      <BadgeCheck size={18} aria-hidden="true" />
                    </span>
                    <span className="text-left">
                      <span className="block text-xs font-bold text-ink">PPB Certified</span>
                      <span className="block text-[10px] text-slate">Fully licensed facility</span>
                    </span>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>

      {/* ---------- Scroll cue ---------- */}
      <a
        href="#accreditations"
        className="absolute bottom-7 left-6 hidden flex-col items-center gap-2 text-primary/70 transition-colors hover:text-primary md:flex lg:left-8"
        aria-label="Scroll to explore"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.25em]">Scroll</span>
        <ChevronDown size={17} className="animate-bounce" aria-hidden="true" />
      </a>

      {/* ---------- Slider controls ---------- */}
      <div className="absolute bottom-5 right-4 z-10 flex items-center gap-2.5 sm:bottom-7 sm:right-8" role="group" aria-label="Hero photo controls">
        <span className="glass-light rounded-full px-3 py-1.5 text-[11px] font-bold tabular-nums text-primary shadow-card">
          {String(index + 1).padStart(2, '0')} <span className="text-slate/60">/ {String(count).padStart(2, '0')}</span>
        </span>

        <div className="hidden items-center gap-1.5 sm:flex">
          {slides.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show photo ${i + 1}: ${item.alt}`}
              aria-pressed={i === index}
              className={`h-1.5 rounded-full shadow-sm transition-all duration-300 ${
                i === index ? 'w-6 bg-gradient-to-r from-primary to-primary-strong' : 'w-1.5 bg-primary/30 hover:bg-primary/60'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous photo"
            className="glass-light flex h-9 w-9 items-center justify-center rounded-full text-primary shadow-card transition-colors hover:bg-white"
          >
            <ChevronLeft size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next photo"
            className="glass-light flex h-9 w-9 items-center justify-center rounded-full text-primary shadow-card transition-colors hover:bg-white"
          >
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  )
}
