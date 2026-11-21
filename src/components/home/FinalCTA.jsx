import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, CalendarDays, ShieldCheck } from 'lucide-react'
import { useMedia } from '../../context/ContentContext.jsx'
import { Reveal, Stagger, StaggerItem } from './motion.jsx'
import { photoSrc } from '../../lib/media.js'

const FALLBACK = {
  badge: "Let's build what's next",
  title: 'Have a product question worth',
  highlight: "an expert's time?",
  lead: "Book a direct consultation or start a conversation with our business development team. From formulation to registration, we've done it before.",
  primary: { label: 'Book a Consultation', to: '/book' },
  secondary: { label: 'Send an Inquiry', to: '/contact' },
  tertiary: { label: 'Explore our services', to: '/services' },
  assurances: ['PPB Certified', 'GMP Compliant', 'Senior specialists', 'East Africa'],
  imageKey: 'site.factory',
  panelImageKey: 'facility.hero',
}

export default function FinalCTA({ content = {} }) {
  const media = useMedia()
  const cta = { ...FALLBACK, ...content }

  return (
    <section className="relative isolate overflow-hidden bg-blue-field py-24 lg:py-32" aria-labelledby="final-cta-title">
      {/* Visual backdrop */}
      <div className="absolute inset-0 -z-30" aria-hidden="true">
        <img src={photoSrc(media, cta.imageKey || 'site.factory')} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover opacity-[0.12] brightness-125" />
      </div>
      <div className="absolute inset-0 -z-20 bg-gradient-to-br from-white/95 via-primary-50/90 to-primary-100/85" aria-hidden="true" />
      <div className="absolute inset-0 -z-20 bg-mesh opacity-60" aria-hidden="true" />
      <div className="absolute inset-0 -z-10 bg-grid opacity-[0.18]" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-24 top-1/2 -z-10 h-[32rem] w-[32rem] -translate-y-1/2 rounded-full bg-primary-strong/15 blur-[120px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-20 -top-20 -z-10 h-[28rem] w-[28rem] rounded-full bg-azure/25 blur-[110px]" aria-hidden="true" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid overflow-hidden rounded-[2rem] border border-primary/15 bg-white shadow-deep lg:grid-cols-5">
          {/* ---------- Copy panel ---------- */}
          <div className="relative bg-blue-deep px-7 py-12 text-white sm:px-12 lg:col-span-3 lg:py-16">
            <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.09]" aria-hidden="true" />
            <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-azure/20 blur-3xl" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-primary-strong/25 blur-3xl" aria-hidden="true" />
            <div className="relative">
              <Reveal>
                <span className="glass-deep inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-azure" />
                  {cta.badge}
                </span>
              </Reveal>

              <Reveal delay={0.08}>
                <h2 id="final-cta-title" className="mt-7 font-heading text-3xl font-extrabold leading-[1.12] tracking-[-0.035em] text-white sm:text-5xl lg:text-[3.6rem] text-balance">
                  {cta.title} <span className="text-gradient-light">{cta.highlight}</span>
                </h2>
                <div className="mt-6 h-1 w-24 rounded-full bg-gradient-to-r from-white via-azure to-primary-light" aria-hidden="true" />
              </Reveal>

              <Reveal delay={0.16}>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
                  {cta.lead}
                </p>
              </Reveal>

              <Reveal delay={0.24}>
                <div className="mt-9 flex flex-col gap-3.5 sm:flex-row">
                  <Link
                    to={cta.primary?.to || '/book'}
                    className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-bold text-primary-deeper shadow-[0_18px_44px_-16px_rgba(0,0,0,0.45)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary-50"
                  >
                    <CalendarDays size={18} aria-hidden="true" />
                    {cta.primary?.label || 'Book a Consultation'}
                    <ArrowRight size={17} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                  <Link to={cta.secondary?.to || '/contact'} className="btn btn-outline-light btn-lg !px-8">
                    {cta.secondary?.label || 'Send an Inquiry'}
                  </Link>
                </div>
                <Link to={cta.tertiary?.to || '/services'} className="group mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-white/80 transition-colors hover:text-white">
                  {cta.tertiary?.label || 'Explore our services'}
                  <ArrowUpRight size={15} aria-hidden="true" className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
              </Reveal>

              <Stagger className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3" delay={0.35} stagger={0.08}>
                {(cta.assurances || []).map((item) => (
                  <StaggerItem key={item} className="flex items-center gap-2 text-xs font-semibold text-white/70">
                    <ShieldCheck size={15} className="text-azure" aria-hidden="true" />
                    {item}
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </div>

          {/* ---------- Photography panel ---------- */}
          <div className="relative hidden min-h-[28rem] lg:col-span-2 lg:block">
            <img
              src={photoSrc(media, cta.panelImageKey || 'facility.hero')}
              alt="Comet Healthcare pharmaceutical manufacturing facility"
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-primary-deeper/60 via-primary/25 to-primary-deeper/30" aria-hidden="true" />
            <div className="absolute inset-0 bg-mesh opacity-40" aria-hidden="true" />
            <div className="absolute bottom-7 left-6 right-6 rounded-2xl border border-white/25 bg-white/12 p-5 shadow-deep backdrop-blur-xl">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">Built in Machakos</span>
              <p className="mt-2 font-heading text-xl font-extrabold leading-snug text-white">
                Real capability.<br />Real partners. Real impact.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
