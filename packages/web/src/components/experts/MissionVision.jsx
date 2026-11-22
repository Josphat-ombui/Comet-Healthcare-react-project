import { Compass, Target } from 'lucide-react'
import { Icon } from '../../lib/icons.jsx'
import { Reveal, Stagger, StaggerItem } from '../home/motion.jsx'
import ExpertImage from './ExpertImage.jsx'
import { useMedia } from '../../context/ContentContext.jsx'
import { getImages, getWebp, MISSION_VISION } from './data.js'

export default function MissionVision() {
  const media = useMedia()
  const IMAGES = getImages(media)
  const WEBP = getWebp(media)
  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-br from-white via-primary-50 to-primary-100 py-20 lg:py-28" aria-labelledby="expert-mission-title">
      <div className="absolute inset-0 bg-grid opacity-20" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-32 top-0 h-96 w-96 rounded-full bg-primary-light/20 blur-[110px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-32 bottom-0 h-80 w-80 rounded-full bg-primary-strong/15 blur-[110px]" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-3xl">
          <span className="eyebrow">{MISSION_VISION.eyebrow}</span>
          <h2 id="expert-mission-title" className="mt-4 font-heading text-3xl font-extrabold leading-[1.15] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.7rem] text-balance">
            {MISSION_VISION.title}
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-8 lg:grid-cols-12 lg:gap-12">
          <Reveal delay={0.08} className="lg:col-span-5">
            <div className="group relative h-full min-h-[20rem] overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/70 p-2 shadow-card backdrop-blur-xl">
              <ExpertImage
                src={IMAGES.mission}
                webp={WEBP.mission}
                alt="Comet Healthcare operations supporting patients across East Africa"
                className="h-full w-full min-h-[19rem] rounded-[1.35rem] object-cover brightness-[1.08] transition-transform duration-[1400ms] ease-out group-hover:scale-105"
              />
              <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-white/70 bg-white/90 p-5 shadow-card backdrop-blur-xl">
                <span className="chip bg-primary-50 text-primary">Our commitment</span>
                <p className="mt-3 font-heading text-lg font-extrabold leading-snug text-ink">
                  Quality you can see. Standards you can trust.
                </p>
              </div>
            </div>
          </Reveal>

          <div className="space-y-5 lg:col-span-7">
            <Reveal delay={0.12}>
              <article className="rounded-[1.5rem] border border-primary/10 bg-white/90 p-6 shadow-card backdrop-blur-xl sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-strong text-white shadow-glow">
                    <Target size={19} aria-hidden="true" />
                  </span>
                  <h3 className="font-heading text-xl font-extrabold text-ink sm:text-2xl">{MISSION_VISION.mission.label}</h3>
                </div>
                <div className="mt-5 space-y-3">
                  {MISSION_VISION.mission.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="flex gap-3 text-sm leading-relaxed text-slate sm:text-[15px]">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-strong" aria-hidden="true" />
                      {paragraph}
                    </p>
                  ))}
                </div>
              </article>
            </Reveal>

            <Reveal delay={0.18}>
              <article className="rounded-[1.5rem] border border-primary/10 bg-gradient-to-br from-primary-deeper to-primary-dark p-6 text-white shadow-pop sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white">
                    <Compass size={19} aria-hidden="true" />
                  </span>
                  <h3 className="font-heading text-xl font-extrabold sm:text-2xl">{MISSION_VISION.vision.label}</h3>
                </div>
                <div className="mt-5 space-y-3">
                  {MISSION_VISION.vision.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="flex gap-3 text-sm leading-relaxed text-white/85 sm:text-[15px]">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" aria-hidden="true" />
                      {paragraph}
                    </p>
                  ))}
                </div>
              </article>
            </Reveal>
          </div>
        </div>

        <Stagger className="mt-10 flex flex-wrap items-center justify-center gap-3" stagger={0.07}>
          {MISSION_VISION.values.map((value) => (
            <StaggerItem key={value}>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white/80 px-4 py-2 text-xs font-bold uppercase tracking-wide text-primary shadow-soft backdrop-blur-md">
                <Icon name="check" size={14} aria-hidden="true" /> {value}
              </span>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  )
}
