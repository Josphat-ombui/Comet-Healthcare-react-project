import { Check, HeartHandshake, Target } from 'lucide-react'
import { Reveal, Stagger, StaggerItem } from '../home/motion.jsx'
import ExpertImage from './ExpertImage.jsx'
import { useMedia } from '../../context/ContentContext.jsx'
import { getImages, getWebp, PURPOSE } from './data.js'

export default function Purpose() {
  const media = useMedia()
  const IMAGES = getImages(media)
  const WEBP = getWebp(media)
  return (
    <section className="relative overflow-hidden bg-cream py-20 lg:py-28" aria-labelledby="expert-purpose-title">
      <div className="pointer-events-none absolute -right-32 top-10 h-96 w-96 rounded-full bg-primary-100/70 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-3xl">
          <span className="eyebrow">Purpose & focus</span>
          <h2 id="expert-purpose-title" className="mt-4 font-heading text-3xl font-extrabold leading-[1.15] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.7rem] text-balance">
            Building access into <span className="text-gradient">every link of care.</span>
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <Reveal delay={0.08}>
            <article className="group relative flex h-full min-h-[26rem] flex-col justify-end overflow-hidden rounded-[1.75rem] border border-primary/10 bg-white shadow-card">
              <ExpertImage
                src={IMAGES.purpose}
                webp={WEBP.purpose}
                alt="Pharmaceutical production supporting access to essential medicines"
                className="absolute inset-0 h-full w-full object-cover brightness-[1.05] transition-transform duration-[1400ms] ease-out group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-white via-white/95 to-white/20" aria-hidden="true" />
              <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-primary-light/25 blur-3xl" aria-hidden="true" />
              <div className="relative p-7 sm:p-9">
                <span className="chip bg-primary-50 text-primary">
                  <HeartHandshake size={14} aria-hidden="true" /> {PURPOSE.eyebrow}
                </span>
                <h3 className="mt-5 font-heading text-2xl font-extrabold leading-tight text-ink sm:text-3xl text-balance">
                  {PURPOSE.title}
                </h3>
                <p className="mt-4 text-sm leading-relaxed text-slate sm:text-[15px]">{PURPOSE.body}</p>
              </div>
            </article>
          </Reveal>

          <Reveal delay={0.16} y={32}>
            <article className="flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-mist bg-white shadow-card">
              <div className="relative h-48 overflow-hidden sm:h-56">
                <ExpertImage
                  src={IMAGES.focus}
                  webp={WEBP.focus}
                  alt="Pharmaceutical packaging and distribution preparation"
                  className="h-full w-full object-cover brightness-[1.08]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-white/85 to-transparent" aria-hidden="true" />
                <span className="absolute bottom-4 left-5 inline-flex items-center gap-2 rounded-full bg-white/90 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-primary shadow-card backdrop-blur-md">
                  <Target size={14} aria-hidden="true" /> What we do
                </span>
              </div>
              <div className="flex flex-1 flex-col p-7 sm:p-9">
                <h3 className="font-heading text-2xl font-extrabold leading-tight text-ink sm:text-3xl">{PURPOSE.focusTitle}</h3>
                <p className="mt-4 text-sm leading-relaxed text-slate sm:text-[15px]">{PURPOSE.focusBody}</p>
                <Stagger className="mt-6 grid gap-2.5 sm:grid-cols-2" stagger={0.07}>
                  {PURPOSE.focusAreas.map((area) => (
                    <StaggerItem key={area}>
                      <div className="flex items-center gap-2.5 rounded-xl border border-primary/10 bg-primary-50/60 px-3.5 py-3 text-[13px] font-semibold text-ink">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                          <Check size={12} strokeWidth={3} aria-hidden="true" />
                        </span>
                        {area}
                      </div>
                    </StaggerItem>
                  ))}
                </Stagger>
              </div>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
