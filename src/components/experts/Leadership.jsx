import { ArrowRight, BadgeCheck, Mail, Phone } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Reveal, Stagger, StaggerItem } from '../home/motion.jsx'
import { useMedia } from '../../context/ContentContext.jsx'
import { personPhotoKey } from '../../lib/experts.js'
import { photoSrc } from '../../lib/media.js'
import { LEADERSHIP } from './data.js'

export default function Leadership() {
  const media = useMedia()
  return (
    <section className="relative overflow-hidden bg-white py-20 lg:py-28" aria-labelledby="expert-leadership-title">
      <div className="pointer-events-none absolute -left-40 top-20 h-96 w-96 rounded-full bg-primary-50/80 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <span className="eyebrow justify-center">{LEADERSHIP.eyebrow}</span>
          <h2 id="expert-leadership-title" className="mt-4 font-heading text-3xl font-extrabold leading-[1.15] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.7rem] text-balance">
            {LEADERSHIP.title}
          </h2>
          <p className="mx-auto mt-5 max-w-3xl text-sm leading-relaxed text-slate sm:text-[15px]">{LEADERSHIP.lead}</p>
        </Reveal>

        <Stagger className="mt-12 grid gap-6 md:grid-cols-3" stagger={0.1}>
          {LEADERSHIP.members.map((member) => (
            <StaggerItem key={member.name}>
              <article className="group flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-mist/90 bg-cream/50 shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/25 hover:bg-white hover:shadow-card-hover">
                <div className={`relative h-72 overflow-hidden ${member.cutout ? 'bg-gradient-to-br from-primary-50 via-white to-primary-100' : 'bg-primary-50'}`}>
                  <img
                    src={photoSrc(media, personPhotoKey(member.name)) || member.image}
                    alt={`Portrait of ${member.name}`}
                    loading="lazy"
                    decoding="async"
                    className={`h-full w-full transition-transform duration-[1200ms] ease-out group-hover:scale-[1.06] ${
                      member.cutout ? 'object-contain object-bottom p-3' : 'object-cover object-top'
                    }`}
                  />
                  <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white/85 to-transparent" aria-hidden="true" />
                  <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-primary shadow-card backdrop-blur-md">
                    <BadgeCheck size={13} aria-hidden="true" /> Leadership
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-6 sm:p-7">
                  <h3 className="font-heading text-xl font-extrabold leading-snug text-ink">{member.name}</h3>
                  <p className="mt-1.5 text-sm font-semibold text-primary">{member.role}</p>
                  <div className="mt-4 space-y-3 text-[13px] leading-relaxed text-slate">
                    <p>{member.bio}</p>
                    <p>{member.bioMore}</p>
                  </div>
                  <div className="mt-auto space-y-2 border-t border-mist/70 pt-5">
                    <a
                      href={`mailto:${member.email}`}
                      className="flex items-center gap-2 text-[13px] font-semibold text-primary transition-colors hover:text-primary-strong"
                    >
                      <Mail size={14} aria-hidden="true" /> {member.email}
                    </a>
                    {member.phone && (
                      <a
                        href={`tel:${member.phone.replace(/[^+\d]/g, '')}`}
                        className="flex items-center gap-2 text-[13px] font-semibold text-slate transition-colors hover:text-primary"
                      >
                        <Phone size={14} aria-hidden="true" /> {member.phone}
                      </a>
                    )}
                  </div>
                </div>
              </article>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal delay={0.15} className="mt-10 text-center">
          <Link to="/team" className="group inline-flex items-center gap-2 text-sm font-bold text-primary hover:text-primary-strong">
            Meet the full Comet team
            <ArrowRight size={17} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </Reveal>
      </div>
    </section>
  )
}
