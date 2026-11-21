import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { Reveal, Stagger, StaggerItem } from '../home/motion.jsx'
import { useMedia } from '../../context/ContentContext.jsx'
import { personPhotoKey } from '../../lib/experts.js'
import { photoSrc } from '../../lib/media.js'

export default function PeopleSpotlight({ content }) {
  const media = useMedia()
  return (
    <section id="people" className="relative scroll-mt-36 overflow-hidden bg-cream py-20 lg:py-28" aria-labelledby="culture-people-title">
      <div className="pointer-events-none absolute -left-32 top-1/2 h-80 w-80 -translate-y-1/2 rounded-full bg-primary-100/60 blur-[110px]" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-3xl">
          <span className="eyebrow">{content.eyebrow}</span>
          <h2 id="culture-people-title" className="mt-4 font-heading text-3xl font-extrabold leading-[1.14] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.7rem] text-balance">
            {content.title}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate">{content.lead}</p>
        </Reveal>

        <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" delay={0.1} stagger={0.08}>
          {(content.members || []).map((member) => (
            <StaggerItem key={member.name} className="group h-full">
              <Link
                to={member.to}
                className="block h-full overflow-hidden rounded-[1.5rem] border border-primary/10 bg-white shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-card"
              >
                <div className="relative h-64 overflow-hidden bg-primary-50">
                  <img
                    src={photoSrc(media, personPhotoKey(member.name)) || member.image}
                    alt={member.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                  <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-primary shadow-card backdrop-blur-md">
                    <ArrowUpRight size={17} aria-hidden="true" />
                  </span>
                </div>
                <div className="p-5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-primary">{member.role}</p>
                  <h3 className="mt-2 font-heading text-lg font-extrabold text-ink">{member.name}</h3>
                  <p className="mt-3 border-t border-mist/80 pt-3 text-[13px] italic leading-relaxed text-slate">“{member.quote}”</p>
                </div>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal delay={0.12}>
          <div className="mt-10 flex justify-center">
            <Link
              to={content.cta.to}
              className="group inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-bold text-white shadow-[0_14px_30px_-14px_rgba(0,82,204,0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary-strong"
            >
              {content.cta.label}
              <ArrowRight size={16} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
