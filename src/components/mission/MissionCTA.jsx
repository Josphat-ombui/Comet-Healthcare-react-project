import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, ShieldCheck, Sparkles } from 'lucide-react'
import { missionRelatedLinks } from '../../lib/navigation.js'
import { Reveal, Stagger, StaggerItem } from '../home/motion.jsx'

export default function MissionCTA({ content }) {
  return (
    <section id="next" className="relative isolate scroll-mt-36 overflow-hidden bg-gradient-to-br from-primary-deeper via-primary-dark to-primary py-20 lg:py-24" aria-labelledby="mission-cta-title">
      <div className="absolute inset-0 -z-20" aria-hidden="true">
        <img src={content.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover opacity-20 brightness-125" />
      </div>
      <div className="absolute inset-0 -z-10 bg-mesh opacity-40" aria-hidden="true" />
      <div className="absolute inset-0 -z-10 bg-grid opacity-10" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-24 top-1/2 h-[30rem] w-[30rem] -translate-y-1/2 rounded-full bg-primary-light/20 blur-[120px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-20 -top-20 h-[28rem] w-[28rem] rounded-full bg-white/10 blur-[110px]" aria-hidden="true" />

      <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <Reveal>
          <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white shadow-card">
            <Sparkles size={13} aria-hidden="true" /> {content.eyebrow}
          </span>
        </Reveal>

        <Reveal delay={0.08}>
          <h2 id="mission-cta-title" className="mt-7 font-heading text-3xl font-extrabold leading-[1.12] tracking-[-0.035em] text-white sm:text-5xl text-balance">
            {content.title}
          </h2>
        </Reveal>

        <Reveal delay={0.16}>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/85 sm:text-lg">{content.body}</p>
        </Reveal>

        <Reveal delay={0.24}>
          <div className="mt-9 flex flex-col justify-center gap-3.5 sm:flex-row">
            <Link
              to={content.primary.to}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-bold text-primary shadow-[0_18px_44px_-16px_rgba(0,0,0,0.45)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary-50"
            >
              {content.primary.label}
              <ArrowRight size={17} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <Link to={content.secondary.to} className="btn btn-outline-light btn-lg !px-8">
              <CalendarDays size={18} aria-hidden="true" /> {content.secondary.label}
            </Link>
          </div>
          <Link
            to={content.tertiary.to}
            className="group mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white/80 transition-colors hover:text-white"
          >
            {content.tertiary.label}
            <ArrowRight size={15} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </Reveal>

        <Reveal delay={0.28}>
          <div className="mx-auto mt-10 max-w-3xl border-t border-white/15 pt-7">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Continue exploring</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
              {missionRelatedLinks.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className="glass inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white/80 transition-all duration-200 hover:-translate-y-px hover:bg-white/15 hover:text-white"
                >
                  {item.name}
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>
        </Reveal>

        <Stagger className="mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-3" delay={0.3} stagger={0.08}>
          {content.assurances.map((item) => (
            <StaggerItem key={item} className="flex items-center gap-2 text-xs font-semibold text-white/75">
              <ShieldCheck size={15} className="text-white" aria-hidden="true" />
              {item}
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  )
}
