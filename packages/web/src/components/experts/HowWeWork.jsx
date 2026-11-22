import { Icon } from '../../lib/icons.jsx'
import { Reveal, Stagger, StaggerItem } from '../home/motion.jsx'
import ExpertImage from './ExpertImage.jsx'
import { useMedia } from '../../context/ContentContext.jsx'
import { getImages, getWebp, HOW_WE_WORK } from './data.js'

export default function HowWeWork() {
  const media = useMedia()
  const IMAGES = getImages(media)
  const WEBP = getWebp(media)
  return (
    <section className="relative overflow-hidden bg-white py-20 lg:py-28" aria-labelledby="expert-how-title">
      <div className="pointer-events-none absolute -left-40 bottom-0 h-96 w-96 rounded-full bg-primary-50/80 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <Reveal className="max-w-2xl">
            <span className="eyebrow">{HOW_WE_WORK.eyebrow}</span>
            <h2 id="expert-how-title" className="mt-4 font-heading text-3xl font-extrabold leading-[1.15] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.7rem] text-balance">
              {HOW_WE_WORK.title}
            </h2>
          </Reveal>
          <Reveal delay={0.1} className="max-w-xl lg:text-right">
            <p className="text-sm leading-relaxed text-slate sm:text-[15px]">{HOW_WE_WORK.lead}</p>
          </Reveal>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-12 lg:gap-10">
          {/* Photo column */}
          <div className="space-y-4 lg:col-span-4">
            <Reveal>
              <div className="group relative h-64 overflow-hidden rounded-[1.5rem] border border-white/80 bg-primary-50 p-1.5 shadow-card sm:h-72">
                <ExpertImage
                  src={IMAGES.quality}
                  webp={WEBP.quality}
                  alt="Quality control laboratory at Comet Healthcare"
                  className="h-full w-full rounded-[1.15rem] object-cover brightness-[1.08] transition-transform duration-[1400ms] ease-out group-hover:scale-110"
                />
                <div className="absolute inset-x-4 bottom-4 rounded-xl border border-white/60 bg-white/90 px-4 py-3 backdrop-blur-xl">
                  <p className="font-heading text-sm font-extrabold text-ink">Tested. Validated. Documented.</p>
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="group relative h-48 overflow-hidden rounded-[1.5rem] border border-white/80 bg-primary-50 p-1.5 shadow-card sm:h-52">
                <ExpertImage
                  src={IMAGES.analytical}
                  webp={WEBP.analytical}
                  alt="Analytical instruments used in pharmaceutical quality control"
                  className="h-full w-full rounded-[1.15rem] object-cover brightness-[1.08] transition-transform duration-[1400ms] ease-out group-hover:scale-110"
                />
                <div className="absolute inset-x-4 bottom-4 rounded-xl border border-white/60 bg-white/90 px-4 py-3 backdrop-blur-xl">
                  <p className="font-heading text-sm font-extrabold text-ink">Science behind every batch</p>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Principles */}
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:col-span-8" stagger={0.07}>
            {HOW_WE_WORK.items.map((item, i) => (
              <StaggerItem key={item.title}>
                <div className="group relative h-full overflow-hidden rounded-2xl border border-mist/90 bg-cream/60 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/25 hover:bg-white hover:shadow-card-hover sm:p-6">
                  <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-primary via-primary-light to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" aria-hidden="true" />
                  <div className="flex items-start gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-strong text-white shadow-[0_10px_22px_-10px_rgba(0,82,204,0.8)]">
                      <Icon name={item.icon} size={20} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-heading text-base font-extrabold leading-snug text-ink sm:text-lg">{item.title}</h3>
                        <span className="font-heading text-xs font-extrabold text-primary/25">0{i + 1}</span>
                      </div>
                      <p className="mt-2 text-[13px] leading-relaxed text-slate sm:text-sm">{item.body}</p>
                    </div>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </div>
    </section>
  )
}
