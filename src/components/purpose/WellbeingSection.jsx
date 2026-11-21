import { Check, Sparkles } from 'lucide-react'
import AnimatedCounter from '../home/AnimatedCounter.jsx'
import { Reveal, Stagger, StaggerItem } from '../home/motion.jsx'
import { SmartImage } from '../ui/SmartImage.jsx'

function Metric({ metric }) {
  const numeric = Number(metric.value)
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/30 hover:bg-white/15">
      <div className="font-heading text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
        {Number.isFinite(numeric) ? (
          <AnimatedCounter value={numeric} suffix={metric.suffix || ''} />
        ) : (
          <span>{metric.value}{metric.suffix || ''}</span>
        )}
      </div>
      <div className="mt-2 text-xs font-bold uppercase tracking-wide text-white/90">{metric.label}</div>
      <div className="mt-1 text-[11px] leading-relaxed text-white/65">{metric.detail}</div>
    </div>
  )
}

export default function WellbeingSection({ content }) {
  return (
    <section id="wellbeing" className="relative isolate scroll-mt-36 overflow-hidden bg-gradient-to-br from-primary-deeper via-primary-dark to-primary py-20 lg:py-28" aria-labelledby="purpose-wellbeing-title">
      <div className="absolute inset-0 -z-20" aria-hidden="true">
        <SmartImage
          src={content.image}
          alt=""
          className="h-full w-full"
          imgClassName="h-full w-full object-cover opacity-15 brightness-125"
        />
      </div>
      <div className="absolute inset-0 -z-10 bg-mesh opacity-40" aria-hidden="true" />
      <div className="absolute inset-0 -z-10 bg-grid opacity-10" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-24 bottom-0 h-96 w-96 rounded-full bg-primary-light/25 blur-[120px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-20 -top-20 h-96 w-96 rounded-full bg-white/10 blur-[110px]" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-6">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white backdrop-blur-md">
                <Sparkles size={13} aria-hidden="true" /> {content.eyebrow}
              </span>
              <h2 id="purpose-wellbeing-title" className="mt-5 font-heading text-3xl font-extrabold leading-[1.12] tracking-[-0.035em] text-white sm:text-4xl lg:text-[2.7rem] text-balance">
                {content.title}
              </h2>
              <div className="mt-6 max-w-xl space-y-4">
                {content.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-relaxed text-white/85 sm:text-[15px]">
                    {paragraph}
                  </p>
                ))}
              </div>
            </Reveal>

            <Stagger className="mt-7 flex flex-wrap gap-2.5" stagger={0.07}>
              {content.badges.map((badge) => (
                <StaggerItem key={badge}>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-[11px] font-bold uppercase tracking-wide text-white backdrop-blur-md">
                    <Check size={13} aria-hidden="true" /> {badge}
                  </span>
                </StaggerItem>
              ))}
            </Stagger>

            <Reveal delay={0.16} className="mt-9 border-l-2 border-white/40 pl-5">
              <p className="font-heading text-lg font-extrabold leading-snug text-white sm:text-xl">
                {content.statement}
              </p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-white/60">
                {content.imageCaption}
              </p>
            </Reveal>
          </div>

          <div className="lg:col-span-6">
            <Stagger className="grid gap-4 sm:grid-cols-2" stagger={0.09}>
              {content.metrics.map((metric) => (
                <StaggerItem key={metric.label}>
                  <Metric metric={metric} />
                </StaggerItem>
              ))}
              <StaggerItem className="sm:col-span-2">
                <div className="glass rounded-2xl px-5 py-4 text-center">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/70">Every batch, every time</p>
                  <p className="mt-1 font-heading text-base font-extrabold text-white">Tested. Validated. Documented.</p>
                </div>
              </StaggerItem>
            </Stagger>
          </div>
        </div>
      </div>
    </section>
  )
}
