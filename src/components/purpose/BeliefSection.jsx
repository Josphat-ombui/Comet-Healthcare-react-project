import { ShieldCheck } from 'lucide-react'
import { Icon } from '../../lib/icons.jsx'
import { Reveal, Stagger, StaggerItem } from '../home/motion.jsx'
import { SmartImage } from '../ui/SmartImage.jsx'

export default function BeliefSection({ content }) {
  return (
    <section id="belief" className="scroll-mt-36 bg-white py-20 lg:py-28" aria-labelledby="purpose-belief-title">
      <div className="pointer-events-none absolute left-0 top-32 h-96 w-96 rounded-full bg-primary-50/70 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <Reveal>
              <span className="eyebrow">{content.eyebrow}</span>
              <h2 id="purpose-belief-title" className="mt-4 font-heading text-3xl font-extrabold leading-[1.15] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.7rem] text-balance">
                {content.title}
              </h2>
              <div className="mt-6 max-w-2xl space-y-5">
                {content.paragraphs.map((paragraph, i) => (
                  <p
                    key={paragraph}
                    className={`leading-relaxed ${i === 0 ? 'text-base font-medium text-ink/80 sm:text-[17px]' : 'text-sm text-slate sm:text-[15px]'}`}
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </Reveal>

            <Stagger className="mt-8 flex flex-wrap gap-2.5" stagger={0.07}>
              {content.commitments.map((commitment) => (
                <StaggerItem key={commitment}>
                  <span className="chip border border-primary/15 bg-primary-50 text-primary">
                    <Icon name="check" size={14} aria-hidden="true" /> {commitment}
                  </span>
                </StaggerItem>
              ))}
            </Stagger>
          </div>

          <div className="lg:col-span-5">
            <Reveal delay={0.12} y={34}>
              <div className="group relative overflow-hidden rounded-[1.75rem] border border-white/80 bg-primary-50 p-2 shadow-card">
                <div className="relative aspect-[4/3] overflow-hidden rounded-[1.35rem]">
                  <SmartImage
                    src={content.image}
                    alt={content.imageAlt}
                    className="absolute inset-0 h-full w-full"
                    imgClassName="h-full w-full object-cover brightness-[1.05] transition-transform duration-[1400ms] ease-out group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary-deeper/85 via-primary-deeper/20 to-transparent" aria-hidden="true" />
                  <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-white/70 bg-white/90 p-5 shadow-card backdrop-blur-xl">
                    <Icon name="quote" size={20} className="text-primary" aria-hidden="true" />
                    <p className="mt-2 font-heading text-lg font-extrabold leading-snug text-ink sm:text-xl">
                      {content.quote}
                    </p>
                  </div>
                  <span className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/20 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur-md">
                    <ShieldCheck size={14} aria-hidden="true" /> {content.badge.label}
                  </span>
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.2} className="mt-4 rounded-2xl border border-primary/10 bg-cream/70 px-5 py-4 text-center">
              <span className="font-heading text-2xl font-extrabold tracking-tight text-gradient">{content.badge.value}</span>
              <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-slate">of continuous pharmaceutical practice</span>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  )
}
