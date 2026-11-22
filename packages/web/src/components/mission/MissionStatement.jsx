import { BadgeCheck, FlaskConical } from 'lucide-react'
import { SmartImage } from '../ui/SmartImage.jsx'
import { Reveal, Stagger, StaggerItem } from '../home/motion.jsx'

export default function MissionStatement({ content }) {
  return (
    <section id="mission" className="scroll-mt-36 overflow-hidden bg-white py-20 lg:py-28" aria-labelledby="mission-statement-title">
      <div className="pointer-events-none absolute -left-40 top-20 h-96 w-96 rounded-full bg-primary-50/70 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-20 lg:px-8">
        <Reveal>
          <div className="relative">
            <div className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/70 p-2 shadow-card">
              <SmartImage
                src={content.image}
                alt={content.imageAlt || 'Comet Healthcare manufacturing'}
                className="h-72 rounded-[1.35rem] sm:h-96 lg:h-[30rem]"
                imgClassName="h-full w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-6 -right-4 hidden max-w-[15rem] rounded-2xl border border-primary/10 bg-white/95 p-5 shadow-pop backdrop-blur-xl sm:block">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-strong text-white shadow-glow">
                <FlaskConical size={19} aria-hidden="true" />
              </span>
              <p className="mt-3 text-sm font-bold leading-snug text-ink">Science with a supply chain that actually reaches patients.</p>
            </div>
          </div>
        </Reveal>

        <div>
          <Reveal delay={0.08}>
            <span className="eyebrow">{content.eyebrow}</span>
            <h2 id="mission-statement-title" className="mt-4 font-heading text-3xl font-extrabold leading-[1.14] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.65rem] text-balance">
              {content.title}
            </h2>
            <p className="mt-5 text-lg font-semibold leading-relaxed text-primary-deeper">{content.lead}</p>
          </Reveal>

          <Reveal delay={0.16}>
            <div className="mt-6 space-y-4">
              {(content.paragraphs || []).map((paragraph, i) => (
                <p key={i} className="text-[15px] leading-relaxed text-slate">{paragraph}</p>
              ))}
            </div>
          </Reveal>

          <Stagger className="mt-9 grid grid-cols-2 gap-3" delay={0.24} stagger={0.07}>
            {(content.stats || []).map((stat) => (
              <StaggerItem key={stat.label} className="rounded-2xl border border-primary/10 bg-primary-50/60 p-4">
                <p className="font-heading text-xl font-extrabold text-primary-deeper sm:text-2xl">{stat.value}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate">{stat.label}</p>
              </StaggerItem>
            ))}
          </Stagger>

          <Reveal delay={0.32}>
            <div className="mt-7 flex items-start gap-3 rounded-2xl border border-primary/10 bg-cream p-4">
              <BadgeCheck size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-[13px] font-semibold leading-relaxed text-ink/80">
                Every decision is measured against one question: does this make reliable medicine more accessible?
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
