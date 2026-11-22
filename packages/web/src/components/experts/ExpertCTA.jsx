import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, ShieldCheck } from 'lucide-react'
import { Reveal, Stagger, StaggerItem } from '../home/motion.jsx'
import ExpertImage from './ExpertImage.jsx'
import { useMedia } from '../../context/ContentContext.jsx'
import { EXPERT_CTA, getImages, getWebp } from './data.js'

export default function ExpertCTA() {
  const media = useMedia()
  const IMAGES = getImages(media)
  const WEBP = getWebp(media)
  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-br from-primary-deeper via-primary-dark to-primary py-20 lg:py-24" aria-labelledby="expert-cta-title">
      <div className="absolute inset-0 -z-20" aria-hidden="true">
        <ExpertImage src={IMAGES.cta} webp={WEBP.cta} alt="" className="h-full w-full object-cover opacity-20 brightness-125" />
      </div>
      <div className="absolute inset-0 -z-10 bg-mesh opacity-40" aria-hidden="true" />
      <div className="absolute inset-0 -z-10 bg-grid opacity-10" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-24 top-1/2 h-[30rem] w-[30rem] -translate-y-1/2 rounded-full bg-primary-light/20 blur-[120px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-20 -top-20 h-[28rem] w-[28rem] rounded-full bg-white/10 blur-[110px]" aria-hidden="true" />

      <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <Reveal>
          <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white shadow-card">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            {EXPERT_CTA.eyebrow}
          </span>
        </Reveal>

        <Reveal delay={0.08}>
          <h2 id="expert-cta-title" className="mt-7 font-heading text-3xl font-extrabold leading-[1.12] tracking-[-0.035em] text-white sm:text-5xl text-balance">
            {EXPERT_CTA.title}
          </h2>
        </Reveal>

        <Reveal delay={0.16}>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/85 sm:text-lg">{EXPERT_CTA.body}</p>
        </Reveal>

        <Reveal delay={0.24}>
          <div className="mt-9 flex flex-col justify-center gap-3.5 sm:flex-row">
            <Link
              to="/contact"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-bold text-primary shadow-[0_18px_44px_-16px_rgba(0,0,0,0.45)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary-50"
            >
              Contact Us
              <ArrowRight size={17} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <Link
              to="/book"
              className="btn btn-outline-light btn-lg !px-8"
            >
              <CalendarDays size={18} aria-hidden="true" /> Book a consultation
            </Link>
          </div>
        </Reveal>

        <Stagger className="mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-3" delay={0.3} stagger={0.08}>
          {['GMP-certified facility', 'PPB registered', 'Senior specialists', 'East Africa'].map((item) => (
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
