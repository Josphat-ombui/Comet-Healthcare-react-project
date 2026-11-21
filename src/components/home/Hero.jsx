import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  ArrowRight, PlayCircle, ShieldCheck, BadgeCheck, Sparkles,
  ChevronDown, ChevronLeft, ChevronRight,
} from 'lucide-react'
import Button from '../ui/Button.jsx'
import { Reveal, Stagger, StaggerItem } from './motion.jsx'
import { HERO_IMAGES } from './data.js'
import { DEFAULT_MEDIA, photoSrc } from '../../lib/media.js'

export default function Hero({ content = {} }) {
  const [index, setIndex] = useState(0)
  const reduce = useReducedMotion()
  const count = HERO_IMAGES.length

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
    next.src = HERO_IMAGES[(index + 1) % count].preview
  }, [index, count, reduce])

  const badge = content.badge || 'Trusted pharmaceutical partner · Kenya & East Africa'
  const sub = content.sub || 'From formulation and scale-up to registration and quality assurance — one accountable partner for the entire life of your product.'
  const slide = HERO_IMAGES[index]

  return (
    <section
      className="relative isolate flex min-h-[92svh] items-center overflow-hidden bg-gradient-to-br from-white via-primary-50 to-primary-100 pt-28 pb-24 sm:pt-32 lg:pt-36 lg:pb-28"
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
              className="h-full w-full animate-kenburns object-cover brightness-[1.12] saturate-[1.05]"
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ---------- Illuminating white → light-blue veil ---------- */}
      <div className="absolute inset-0 -z-20 bg-gradient-to-r from-white/95 via-primary-50/85 to-white/15 sm:from-white/95 sm:via-primary-50/75 sm:to-transparent" aria-hidden="true" />
      <div className="absolute inset-0 -z-20 bg-gradient-to-t from-white/85 via-white/10 to-white/45" aria-hidden="true" />
      <div className="absolute inset-0 -z-20 bg-white/45 sm:hidden" aria-hidden="true" />
      <div className="absolute inset-0 -z-20 bg-mesh opacity-50" aria-hidden="true" />
      <div className="absolute inset-0 -z-10 bg-grid opacity-20 mask-fade-b" aria-hidden="true" />

      {/* ---------- Soft light accents ---------- */}
      <div className="pointer-events-none absolute -right-32 top-0 -z-10 h-[30rem] w-[30rem] rounded-full bg-primary-light/20 blur-[130px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-40 bottom-0 -z-10 h-[26rem] w-[26rem] rounded-full bg-primary-strong/15 blur-[120px]" aria-hidden="true" />

      <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-12 lg:gap-10">
          {/* ---------- Copy ---------- */}
          <div className="lg:col-span-7">
            <Reveal>
              <span className="glass-light inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-[12px] font-bold tracking-wide text-primary shadow-card sm:text-[13px]">
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
                Expert guidance for the journey <span className="text-gradient">from molecule to market.</span>
              </h1>
            </Reveal>

            <Reveal delay={0.16}>
              <p className="mt-6 max-w-xl text-base font-medium leading-relaxed text-slate sm:text-lg">
                {sub}
              </p>
            </Reveal>

            <Reveal delay={0.24}>
              <div className="mt-9 flex flex-col gap-3.5 sm:flex-row">
                <Button to="/book" size="lg" className="group !px-8">
                  Book a Consultation
                  <ArrowRight size={18} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1" />
                </Button>
                <a href="/products" className="btn btn-outline btn-lg group !px-8 backdrop-blur-md">
                  <PlayCircle size={18} aria-hidden="true" />
                  Explore Our Work
                </a>
              </div>
            </Reveal>

            <Stagger className="mt-11 flex flex-wrap items-center gap-x-7 gap-y-4" delay={0.4} stagger={0.1}>
              {[
                { icon: ShieldCheck, label: 'GMP Certified' },
                { icon: BadgeCheck, label: 'PPB Registered' },
                { icon: Sparkles, label: '20+ Years of Trust' },
              ].map(({ icon: Icon, label }) => (
                <StaggerItem key={label} className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Icon size={17} className="text-primary-strong" aria-hidden="true" />
                  {label}
                </StaggerItem>
              ))}
            </Stagger>
          </div>

          {/* ---------- Visual card ---------- */}
          <div className="relative hidden lg:col-span-5 lg:block">
            <Reveal delay={0.2} y={40}>
              <div className="relative mx-auto w-full max-w-[26rem]">
                <div className="absolute -inset-5 rounded-[2.5rem] bg-gradient-to-br from-white via-primary-light/25 to-transparent blur-2xl" aria-hidden="true" />

                <div className="relative overflow-hidden rounded-[1.8rem] border border-white/80 bg-white/70 p-2 shadow-pop backdrop-blur-xl">
                  <div className="relative overflow-hidden rounded-[1.4rem]">
                    <img
                      src={photoSrc(DEFAULT_MEDIA, 'site.lab')}
                      alt="Scientists and analytical equipment in the Comet Healthcare quality control laboratory"
                      loading="lazy"
                      decoding="async"
                      className="aspect-[4/4.1] h-full w-full object-cover brightness-[1.12]"
                    />
                    <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-white/70 bg-white/90 p-4 shadow-card backdrop-blur-xl">
                      <span className="chip bg-primary-50 text-primary">Behind the science</span>
                      <p className="mt-3 font-heading text-lg font-extrabold leading-snug text-ink">
                        Quality you can see.<br />Standards you can trust.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="absolute -bottom-7 -left-10 rounded-2xl border border-primary/10 bg-white p-4 shadow-pop">
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-strong text-white shadow-glow">
                      <ShieldCheck size={24} aria-hidden="true" />
                    </div>
                    <div>
                      <div className="font-heading text-2xl font-extrabold leading-none text-ink">100%</div>
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate">Batch tested</div>
                    </div>
                  </div>
                </div>

                <div className="glass-light rounded-2xl absolute -right-6 -top-6 px-4 py-3 shadow-pop">
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
          {HERO_IMAGES.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show photo ${i + 1}: ${item.alt}`}
              aria-pressed={i === index}
              className={`h-1.5 rounded-full shadow-sm transition-all duration-300 ${
                i === index ? 'w-6 bg-primary' : 'w-1.5 bg-primary/30 hover:bg-primary/60'
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
