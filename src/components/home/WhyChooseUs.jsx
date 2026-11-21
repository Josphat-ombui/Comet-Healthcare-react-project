import { Check, Minus, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Reveal, Stagger, StaggerItem } from './motion.jsx'
import { COMPARISON } from './data.js'

const BENEFITS = [
  { title: 'One accountable partner', desc: 'Manufacturing, quality and regulatory expertise coordinated under one roof.' },
  { title: 'Senior people, directly', desc: 'Speak with the specialists who actually do the work — not a call centre.' },
  { title: 'Quality as a system', desc: 'Documented SOPs, batch testing and audits that hold up to scrutiny.' },
  { title: 'Built for East Africa', desc: 'Local knowledge of PPB processes and regional distribution realities.' },
]

export default function WhyChooseUs() {
  return (
    <section id="why-us" className="relative overflow-hidden bg-gradient-to-b from-white via-ice/60 to-white py-24 lg:py-32" aria-labelledby="why-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          {/* Copy */}
          <Reveal>
            <span className="eyebrow">Why Comet</span>
            <h2 id="why-title" className="mt-4 font-heading text-3xl font-extrabold leading-[1.15] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.9rem] text-balance">
              The difference is in <span className="text-gradient">how we work.</span>
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate">
              Choosing a manufacturing partner is a long-term decision. Here is what partners get when they work with Comet Healthcare.
            </p>

            <Stagger className="mt-9 space-y-4" stagger={0.08}>
              {BENEFITS.map((benefit) => (
                <StaggerItem key={benefit.title}>
                  <div className="flex gap-4">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary">
                      <Check size={16} strokeWidth={3} aria-hidden="true" />
                    </span>
                    <div>
                      <div className="font-heading text-base font-bold text-ink">{benefit.title}</div>
                      <p className="mt-1 text-sm leading-relaxed text-slate">{benefit.desc}</p>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>

            <div className="mt-9 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <Link to="/about" className="group inline-flex items-center gap-2 text-sm font-bold text-primary hover:text-primary-strong">
                More about Comet
                <ArrowRight size={17} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <Link to="/book" className="btn btn-primary btn-md group">
                Book a consultation
                <ArrowRight size={16} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>
          </Reveal>

          {/* Comparison card */}
          <Reveal delay={0.15} y={34}>
            <div className="relative">
              <div className="absolute -inset-5 rounded-[2.5rem] bg-gradient-to-br from-primary/10 via-primary-light/10 to-transparent blur-2xl" aria-hidden="true" />
              <div className="relative overflow-hidden rounded-[1.75rem] border border-mist bg-white shadow-card-hover">
                {/* Header */}
                <div className="relative overflow-hidden border-b border-primary/10 bg-gradient-to-br from-primary-50 via-white to-primary-100 px-6 py-7 sm:px-8">
                  <div className="absolute inset-0 bg-grid opacity-30" aria-hidden="true" />
                  <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full bg-primary-light/20 blur-2xl" aria-hidden="true" />
                  <div className="relative">
                    <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">The Comet difference</span>
                    <h3 className="mt-2 font-heading text-2xl font-extrabold text-ink">What sets us apart</h3>
                    <p className="mt-1.5 text-sm text-slate">A clear comparison, based on how we work every day.</p>
                  </div>
                </div>

                {/* Table */}
                <div className="px-4 py-3 sm:px-6 sm:py-4">
                  <div className="grid grid-cols-[1fr_1.15fr_1fr] gap-2 border-b border-mist px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate sm:text-[11px]">
                    <span>Area</span>
                    <span className="text-primary">Comet Healthcare</span>
                    <span>Typical approach</span>
                  </div>
                  {COMPARISON.map((row) => (
                    <div key={row.feature} className="grid grid-cols-[1fr_1.15fr_1fr] items-start gap-2 border-b border-mist/70 px-3 py-4 text-xs last:border-0 sm:text-sm">
                      <span className="font-bold leading-snug text-ink">{row.feature}</span>
                      <span className="flex items-start gap-1.5 font-semibold leading-snug text-primary">
                        <Check size={14} strokeWidth={3} className="mt-0.5 shrink-0" aria-hidden="true" />
                        {row.comet}
                      </span>
                      <span className="flex items-start gap-1.5 leading-snug text-slate">
                        <Minus size={13} className="mt-0.5 shrink-0 text-slate/50" aria-hidden="true" />
                        {row.other}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-mist bg-cream/60 px-7 py-4 text-[11px] leading-relaxed text-slate">
                  Based on our 20+ years supporting regulated manufacturers across East Africa.
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
