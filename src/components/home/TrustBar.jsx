import { Icon } from '../../lib/icons.jsx'
import { Reveal, Stagger, StaggerItem } from './motion.jsx'
import { ACCREDITATIONS } from './data.js'

export default function TrustBar() {
  return (
    <section id="accreditations" className="relative overflow-hidden border-b border-mist bg-white" aria-labelledby="trust-title">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" aria-hidden="true" />
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
        <Reveal className="mb-9 text-center">
          <p id="trust-title" className="eyebrow justify-center">Accredited &amp; trusted</p>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate sm:text-base">
           Built on regulated processes, independent certification and two decades of serving healthcare partners across the region.
          </p>
        </Reveal>

        <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" stagger={0.08}>
          {ACCREDITATIONS.map((item) => (
            <StaggerItem key={item.title}>
              <div className="group relative h-full overflow-hidden rounded-2xl border border-mist/80 bg-cream/70 p-5 text-center transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:bg-white hover:shadow-card sm:p-6">
                <div className="absolute inset-x-0 top-0 h-[3px] scale-x-0 bg-gradient-to-r from-primary via-primary-strong to-primary-light transition-transform duration-500 group-hover:scale-x-100" aria-hidden="true" />
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary transition-all duration-300 group-hover:bg-gradient-to-br group-hover:from-primary group-hover:to-primary-strong group-hover:text-white group-hover:shadow-glow">
                  <Icon name={item.icon} size={22} aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-heading text-base font-bold text-ink sm:text-lg">{item.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate">{item.detail}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal delay={0.2} className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-mist/80 pt-8">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate">Trusted across</span>
          {['Hospitals', 'Retail pharmacy', 'Distributors', 'Manufacturers', 'Clinics'].map((name) => (
            <span key={name} className="font-heading text-sm font-extrabold uppercase tracking-[0.14em] text-primary/45 transition-colors hover:text-primary">
              {name}
            </span>
          ))}
        </Reveal>
      </div>
    </section>
  )
}
