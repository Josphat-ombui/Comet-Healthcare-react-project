import { ArrowDown, Check, Sparkles } from 'lucide-react'
import { Icon } from '../../lib/icons.jsx'
import { Reveal, Stagger, StaggerItem } from '../home/motion.jsx'
import ExpertImage from './ExpertImage.jsx'
import { useMedia } from '../../context/ContentContext.jsx'
import { getImages, getWebp, SERVICES } from './data.js'

export default function Services() {
  const media = useMedia()
  const IMAGES = getImages(media)
  const WEBP = getWebp(media)
  return (
    <section className="relative overflow-hidden bg-cream py-20 lg:py-28" aria-labelledby="expert-services-title">
      <div className="pointer-events-none absolute -right-40 top-20 h-96 w-96 rounded-full bg-primary-50 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <div className="relative h-64 overflow-hidden rounded-[1.75rem] border border-white/80 bg-white p-2 shadow-card sm:h-72">
              <ExpertImage
                src={IMAGES.services}
                webp={WEBP.services}
                alt="Sterile pharmaceutical production line at Comet Healthcare"
                className="h-full w-full rounded-[1.35rem] object-cover brightness-[1.08]"
              />
              <div className="absolute inset-x-5 bottom-5 flex items-center gap-3 rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-card backdrop-blur-xl">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary">
                  <Sparkles size={18} aria-hidden="true" />
                </span>
                <p className="font-heading text-sm font-extrabold text-ink">Built for real-world healthcare needs</p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1} className="lg:col-span-7">
            <span className="eyebrow">{SERVICES.eyebrow}</span>
            <h2 id="expert-services-title" className="mt-4 font-heading text-3xl font-extrabold leading-[1.15] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.7rem] text-balance">
              {SERVICES.title}
            </h2>
            <p className="mt-5 text-sm leading-relaxed text-slate sm:text-[15px]">{SERVICES.lead}</p>
            <a
              href="#expert-directory"
              className="group mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary hover:text-primary-strong"
            >
              Find the right specialist
              <ArrowDown size={16} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-y-0.5" />
            </a>
          </Reveal>
        </div>

        <Stagger className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3" stagger={0.08}>
          {SERVICES.items.map((service, i) => (
            <StaggerItem key={service.title}>
              <article className="group relative flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-mist/90 bg-white p-6 shadow-soft transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/25 hover:shadow-card-hover">
                <div className="absolute right-5 top-5 font-heading text-5xl font-extrabold leading-none text-primary/[0.06]">0{i + 1}</div>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-strong text-white shadow-[0_12px_24px_-12px_rgba(0,82,204,0.85)] transition-transform duration-300 group-hover:scale-110">
                  <Icon name={service.icon} size={21} aria-hidden="true" />
                </span>
                <h3 className="mt-5 max-w-[85%] font-heading text-lg font-extrabold leading-snug text-ink sm:text-xl">
                  {service.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-slate">{service.intro}</p>
                <ul className="mt-5 space-y-2.5 border-t border-mist/70 pt-5">
                  {service.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-slate">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary">
                        <Check size={11} strokeWidth={3} aria-hidden="true" />
                      </span>
                      {bullet}
                    </li>
                  ))}
                </ul>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  )
}
