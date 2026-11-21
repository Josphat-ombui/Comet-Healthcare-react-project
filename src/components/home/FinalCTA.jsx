import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, ShieldCheck } from 'lucide-react'
import { Reveal, Stagger, StaggerItem } from './motion.jsx'
import { DEFAULT_MEDIA, photoSrc } from '../../lib/media.js'

export default function FinalCTA() {
  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-br from-white via-primary-50 to-primary-100 py-24 lg:py-32" aria-labelledby="final-cta-title">
      {/* Visual backdrop */}
      <div className="absolute inset-0 -z-30" aria-hidden="true">
        <img src={photoSrc(DEFAULT_MEDIA, 'site.factory')} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover opacity-[0.14] brightness-125" />
      </div>
      <div className="absolute inset-0 -z-20 bg-gradient-to-br from-white/95 via-primary-50/90 to-primary-100/85" aria-hidden="true" />
      <div className="absolute inset-0 -z-20 bg-mesh opacity-50" aria-hidden="true" />
      <div className="absolute inset-0 -z-10 bg-grid opacity-20" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-24 top-1/2 -z-10 h-[32rem] w-[32rem] -translate-y-1/2 rounded-full bg-primary-strong/15 blur-[120px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-20 -top-20 -z-10 h-[28rem] w-[28rem] rounded-full bg-primary-light/20 blur-[110px]" aria-hidden="true" />

      <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <Reveal>
          <span className="glass-light inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-primary shadow-card">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-strong" />
            Let's build what's next
          </span>
        </Reveal>

        <Reveal delay={0.08}>
          <h2 id="final-cta-title" className="mt-7 font-heading text-3xl font-extrabold leading-[1.12] tracking-[-0.035em] text-ink sm:text-5xl lg:text-[3.6rem] text-balance">
            Have a product question worth <span className="text-gradient">an expert's time?</span>
          </h2>
        </Reveal>

        <Reveal delay={0.16}>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate sm:text-lg">
            Book a direct consultation or start a conversation with our business development team. From formulation to registration, we've done it before.
          </p>
        </Reveal>

        <Reveal delay={0.24}>
          <div className="mt-9 flex flex-col justify-center gap-3.5 sm:flex-row">
            <Link
              to="/book"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary-dark via-primary to-primary-strong px-8 py-4 text-sm font-bold text-white shadow-[0_18px_44px_-16px_rgba(0,82,204,0.7)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_52px_-16px_rgba(0,123,255,0.8)]"
            >
              <CalendarDays size={18} aria-hidden="true" />
              Book a Consultation
              <ArrowRight size={17} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <Link to="/contact" className="btn btn-outline btn-lg !px-8 backdrop-blur-md">
              Send an Inquiry
            </Link>
          </div>
        </Reveal>

        <Stagger className="mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-3" delay={0.35} stagger={0.08}>
          {['PPB Certified', 'GMP Compliant', 'Senior specialists', 'East Africa'].map((item) => (
            <StaggerItem key={item} className="flex items-center gap-2 text-xs font-semibold text-slate">
              <ShieldCheck size={15} className="text-primary-strong" aria-hidden="true" />
              {item}
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  )
}
