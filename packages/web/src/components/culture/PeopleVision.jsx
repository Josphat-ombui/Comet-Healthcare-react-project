import { ArrowRight, Quote, Sparkles } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { SmartImage } from '../ui/SmartImage.jsx'
import { Reveal, Stagger, StaggerItem } from '../home/motion.jsx'

export default function PeopleVision({ content }) {
  return (
    <section id="people-vision" className="relative isolate scroll-mt-36 overflow-hidden bg-white py-20 lg:py-28" aria-labelledby="culture-people-vision-title">
      <div className="pointer-events-none absolute -left-40 top-10 h-96 w-96 rounded-full bg-primary-50/70 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-80 w-80 rounded-full bg-primary-100/50 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20 lg:px-8">
        <div>
          <Reveal>
            <span className="eyebrow">{content.eyebrow}</span>
            <h2 id="culture-people-vision-title" className="mt-4 font-heading text-3xl font-extrabold leading-[1.14] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.7rem] text-balance">
              {content.title}
            </h2>
          </Reveal>

          <Reveal delay={0.08}>
            <blockquote className="mt-7 flex gap-4 rounded-2xl border-l-4 border-primary bg-primary-50/70 p-5 sm:p-6">
              <Quote size={26} className="shrink-0 text-primary" aria-hidden="true" />
              <p className="font-heading text-lg font-extrabold leading-snug text-ink sm:text-xl">{content.quote}</p>
            </blockquote>
          </Reveal>

          <Reveal delay={0.16}>
            <div className="mt-6 space-y-4">
              {(content.paragraphs || []).map((paragraph, i) => (
                <p key={i} className="text-[15px] leading-relaxed text-slate">{paragraph}</p>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button to={content.primary.to} size="md">
                {content.primary.label} <ArrowRight size={16} aria-hidden="true" />
              </Button>
              <Button to={content.secondary.to} variant="outline" size="md">
                {content.secondary.label}
              </Button>
            </div>
          </Reveal>
        </div>

        <div>
          <Reveal delay={0.12}>
            <div className="relative">
              <div className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/70 p-2 shadow-card">
                <SmartImage
                  src={content.image}
                  alt={content.imageAlt || 'Comet Healthcare team at work'}
                  className="h-72 rounded-[1.35rem] sm:h-96 lg:h-[30rem]"
                  imgClassName="h-full w-full object-cover"
                />
              </div>
              <div className="absolute -bottom-6 -left-4 hidden max-w-[15rem] rounded-2xl border border-primary/10 bg-white/95 p-5 shadow-pop backdrop-blur-xl sm:block">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-strong text-white shadow-glow">
                  <Sparkles size={19} aria-hidden="true" />
                </span>
                <p className="mt-3 text-sm font-bold leading-snug text-ink">Every role protects the promise behind every prescription.</p>
              </div>
            </div>
          </Reveal>

          <Stagger className="mt-10 grid grid-cols-2 gap-3" delay={0.2} stagger={0.07}>
            {(content.stats || []).map((stat) => (
              <StaggerItem key={stat.label} className="rounded-2xl border border-primary/10 bg-cream/80 p-4 text-center">
                <p className="font-heading text-xl font-extrabold text-primary-deeper sm:text-2xl">{stat.value}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate">{stat.label}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </div>
    </section>
  )
}
