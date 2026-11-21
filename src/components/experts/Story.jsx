import { BadgeCheck, Building2 } from 'lucide-react'
import { Reveal, Stagger, StaggerItem } from '../home/motion.jsx'
import ExpertImage from './ExpertImage.jsx'
import { useMedia } from '../../context/ContentContext.jsx'
import { getImages, getWebp, STORY } from './data.js'

export default function Story() {
  const media = useMedia()
  const IMAGES = getImages(media)
  const WEBP = getWebp(media)
  return (
    <section className="relative overflow-hidden bg-white py-20 lg:py-28" aria-labelledby="expert-story-title">
      <div className="pointer-events-none absolute -left-40 top-24 h-96 w-96 rounded-full bg-primary-50/80 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-6">
            <Reveal>
              <span className="eyebrow">{STORY.eyebrow}</span>
              <h2 id="expert-story-title" className="mt-4 font-heading text-3xl font-extrabold leading-[1.15] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.7rem] text-balance">
                {STORY.title}
              </h2>
              <div className="mt-6 space-y-5">
                {STORY.paragraphs.map((paragraph, i) => (
                  <p
                    key={paragraph}
                    className={`leading-relaxed text-slate ${i === 0 ? 'text-base font-medium text-ink/80 sm:text-[17px]' : 'text-sm sm:text-[15px]'}`}
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </Reveal>
          </div>

          <div className="lg:col-span-6">
            <Reveal delay={0.12} y={34}>
              <div className="group relative overflow-hidden rounded-[1.75rem] border border-white/80 bg-primary-50 p-2 shadow-card">
                <div className="relative aspect-[4/3] overflow-hidden rounded-[1.35rem]">
                  <ExpertImage
                    src={IMAGES.story}
                    webp={WEBP.story}
                    alt="Comet Healthcare pharmaceutical manufacturing facility"
                    className="h-full w-full object-cover brightness-[1.08] transition-transform duration-[1400ms] ease-out group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary-deeper/80 via-transparent to-transparent" aria-hidden="true" />
                  <div className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur-md">
                    <Building2 size={14} aria-hidden="true" /> Machakos, Kenya
                  </div>
                  <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-white/70 bg-white/90 p-4 shadow-card backdrop-blur-xl sm:p-5">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-strong text-white shadow-glow">
                        <BadgeCheck size={20} aria-hidden="true" />
                      </span>
                      <p className="font-heading text-base font-extrabold leading-snug text-ink sm:text-lg">
                        Modernised equipment. State-of-the-art plant. Excellence without compromise.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>

            <Stagger className="mt-6 grid grid-cols-2 gap-3 sm:gap-4" stagger={0.08}>
              {STORY.stats.map((stat) => (
                <StaggerItem key={stat.label}>
                  <div className="rounded-2xl border border-primary/10 bg-cream/70 px-4 py-5 text-center transition-colors hover:bg-white hover:shadow-card sm:px-5">
                    <div className="font-heading text-2xl font-extrabold tracking-tight text-gradient sm:text-3xl">
                      {stat.value}{stat.suffix}
                    </div>
                    <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate sm:text-xs">{stat.label}</div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </div>
      </div>
    </section>
  )
}
