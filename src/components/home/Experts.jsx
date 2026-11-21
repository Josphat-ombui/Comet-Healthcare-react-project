import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, CalendarDays } from 'lucide-react'
import { SmartImage } from '../ui/SmartImage.jsx'
import { Reveal, Stagger, StaggerItem } from './motion.jsx'
import { useMedia } from '../../context/ContentContext.jsx'
import { personPhotoKey } from '../../lib/experts.js'
import { photoSrc } from '../../lib/media.js'

const FALLBACK_EXPERTS = [
  { name: 'Dr. George Wafula', title: 'Quality Assurance & GMP', specialty: 'Quality', photo: 'team.georgeWafula', slug: 'dr-george-wafula', location: 'Machakos, KE' },
  { name: 'Mr. Bramwel Wambua', title: 'Quality Control & analytics', specialty: 'Quality', photo: 'team.bramwelWambua', slug: 'bramwel-wambua', location: 'Machakos, KE' },
  { name: 'Christopher Musembi', title: 'CDMO & scale-up', specialty: 'Manufacturing', photo: 'team.christopherMusembi', slug: 'christopher-musembi', location: 'Machakos, KE' },
]

export default function Experts({ experts = [] }) {
  const media = useMedia()
  const shown = (experts.length ? experts : FALLBACK_EXPERTS).slice(0, 3)

  return (
    <section className="relative overflow-hidden bg-white py-24 lg:py-28" aria-labelledby="experts-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <Reveal className="max-w-2xl">
            <span className="eyebrow">Our experts</span>
            <h2 id="experts-title" className="mt-4 font-heading text-3xl font-extrabold leading-[1.15] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.7rem] text-balance">
              Talk to the people who <span className="text-gradient">do the work.</span>
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate">
              Senior pharmacists, scientists and regulatory specialists — available for direct consultation.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <Link to="/experts" className="group inline-flex shrink-0 items-center gap-2 text-sm font-bold text-primary hover:text-primary-strong">
              View all experts
              <ArrowRight size={17} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </Reveal>
        </div>

        <Stagger className="mt-14 grid gap-6 md:grid-cols-3" stagger={0.1}>
          {shown.map((expert, i) => {
            const fallback = FALLBACK_EXPERTS[i % FALLBACK_EXPERTS.length]
            const photoKey = personPhotoKey(expert.name) || expert.photoKey || fallback.photo
            const portrait = photoSrc(media, photoKey) || expert.image || fallback.image
            return (
            <StaggerItem key={expert.slug || expert.name}>
              <Link
                to={expert.slug ? `/experts/${expert.slug}` : '/experts'}
                className="group relative flex items-center gap-5 overflow-hidden rounded-[1.5rem] border border-mist/80 bg-cream/50 p-5 transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/25 hover:bg-white hover:shadow-card-hover"
              >
                <SmartImage
                  src={portrait}
                  alt={`Portrait of ${expert.name}`}
                  className="h-20 w-20 shrink-0 rounded-2xl"
                  imgClassName="h-full w-full object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-heading text-base font-extrabold leading-snug text-ink group-hover:text-primary sm:text-lg">{expert.name}</span>
                  <span className="mt-1 block text-sm text-slate">{expert.title || expert.specialty}</span>
                  <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                    <CalendarDays size={11} aria-hidden="true" /> Available to consult
                  </span>
                </span>
                <ArrowUpRight size={18} className="absolute right-4 top-4 text-primary/0 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
              </Link>
            </StaggerItem>
            )
          })}
        </Stagger>
      </div>
    </section>
  )
}
