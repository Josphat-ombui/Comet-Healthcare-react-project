import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, CalendarDays } from 'lucide-react'
import { useContent, useMedia } from '../context/ContentContext.jsx'
import { photoSrc } from '../lib/media.js'

// The shared conversion band used at the end of inner pages. Copy and photo
// come from the CMS `home.finalCta` branch so every page stays in sync.
export default function CTASection() {
  const { site } = useContent()
  const media = useMedia()
  const cta = {
    badge: "Let's build what's next",
    title: 'Have a product question worth',
    highlight: "an expert's time?",
    lead: "Book a direct consultation or start the conversation with our business development team — from formulation to registration, we've done it before.",
    primary: { label: 'Book a Consultation', to: '/book' },
    secondary: { label: 'Send an Inquiry', to: '/contact' },
    imageKey: 'site.factory',
    ...(site?.home?.finalCta || {}),
  }

  return (
    <section className="relative isolate overflow-hidden bg-primary-deeper py-20 lg:py-24" aria-labelledby="cta-title">
      {/* High-resolution Comet facility photography from the project library. */}
      <div className="absolute inset-0 -z-30" aria-hidden="true">
        <img
          src={photoSrc(media, cta.imageKey || 'site.factory')}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover object-center opacity-30"
        />
      </div>
      <div className="absolute inset-0 -z-20 bg-gradient-to-br from-primary-deeper/95 via-primary/90 to-primary-deeper/85" aria-hidden="true" />
      <div className="absolute inset-0 -z-10 bg-grid opacity-10" aria-hidden="true" />
      <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-primary-light/20 blur-3xl" aria-hidden="true" />
      <div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-secondary/10 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        {cta.badge && (
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-white/90 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
            {cta.badge}
          </p>
        )}
        <h2 id="cta-title" className="mb-4 font-heading text-3xl font-extrabold tracking-[-0.03em] text-white md:text-4xl lg:text-5xl text-balance">
          {cta.title} <span className="text-secondary">{cta.highlight}</span>
        </h2>
        <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-white/80">{cta.lead}</p>
        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <Link
            to={cta.primary?.to || '/book'}
            className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-bold text-primary shadow-[0_14px_30px_-12px_rgba(0,0,0,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-50"
          >
            <CalendarDays size={17} aria-hidden="true" />
            {cta.primary?.label || 'Book a Consultation'}
            <ArrowRight size={16} aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
          <Link
            to={cta.secondary?.to || '/contact'}
            className="group inline-flex items-center justify-center gap-2 rounded-full border border-white/40 px-8 py-3.5 text-sm font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:border-white hover:bg-white/10"
          >
            {cta.secondary?.label || 'Send an Inquiry'}
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}
