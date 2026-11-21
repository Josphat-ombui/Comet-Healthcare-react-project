import { ArrowUpRight, Compass } from 'lucide-react'
import { SmartImage } from '../ui/SmartImage.jsx'
import { Reveal, Stagger, StaggerItem } from '../home/motion.jsx'

export default function VisionStatement({ content }) {
  return (
    <section id="vision" className="scroll-mt-36 overflow-hidden bg-cream py-20 lg:py-28" aria-labelledby="mission-vision-title">
      <div className="pointer-events-none absolute -right-40 top-0 h-[30rem] w-[30rem] rounded-full bg-primary-100/60 blur-[120px]" aria-hidden="true" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-20 lg:px-8">
        <div className="order-2 lg:order-1">
          <Reveal>
            <span className="eyebrow">{content.eyebrow}</span>
            <h2 id="mission-vision-title" className="mt-4 font-heading text-3xl font-extrabold leading-[1.14] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.65rem] text-balance">
              {content.title}
            </h2>
            <p className="mt-5 text-lg font-semibold leading-relaxed text-primary-deeper">{content.lead}</p>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="mt-6 space-y-4">
              {(content.paragraphs || []).map((paragraph, i) => (
                <p key={i} className="text-[15px] leading-relaxed text-slate">{paragraph}</p>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.16}>
            <blockquote className="mt-8 flex items-start gap-4 rounded-2xl border-l-4 border-primary bg-white/80 p-5 shadow-soft">
              <Compass size={22} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <p className="font-heading text-lg font-extrabold leading-snug text-ink">“{content.quote}”</p>
            </blockquote>
          </Reveal>

          <Stagger className="mt-7 space-y-3" delay={0.24} stagger={0.08}>
            {(content.pillars || []).map((pillar) => (
              <StaggerItem key={pillar.title} className="flex items-start gap-3 rounded-xl border border-primary/10 bg-white/70 p-4">
                <ArrowUpRight size={17} className="mt-0.5 shrink-0 text-primary-strong" aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold text-ink">{pillar.title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate">{pillar.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>

        <Reveal delay={0.12} className="order-1 lg:order-2">
          <div className="relative">
            <div className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/70 p-2 shadow-card">
              <SmartImage
                src={content.image}
                alt={content.imageAlt || 'Comet Healthcare facility'}
                className="h-72 rounded-[1.35rem] sm:h-96 lg:h-[30rem]"
                imgClassName="h-full w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-6 -left-4 rounded-2xl bg-gradient-to-br from-primary to-primary-strong px-5 py-4 text-white shadow-pop">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">Our horizon</p>
              <p className="mt-1 font-heading text-lg font-extrabold">East Africa, and beyond</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
