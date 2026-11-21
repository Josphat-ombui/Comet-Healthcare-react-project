import { Link } from 'react-router-dom'
import { ArrowRight, Quote, Star, CheckCircle2, TrendingUp, Globe2 } from 'lucide-react'
import AnimatedCounter from './AnimatedCounter.jsx'
import { Reveal, Stagger, StaggerItem } from './motion.jsx'
import { IMPACT_STATS } from './data.js'

const FALLBACK_QUOTE = {
  quote: 'Their team guided our registration dossier with a level of rigour that made approval straightforward. We always knew where we stood.',
  name: 'Pharmaceutical partner',
  role: 'Kenya · East Africa',
  rating: 5,
}

export default function Impact({ stats = IMPACT_STATS, testimonials = [] }) {
  const story = testimonials.find((t) => t.quote) || FALLBACK_QUOTE

  return (
    <section id="impact" className="relative isolate overflow-hidden bg-blue-field py-24 lg:py-32" aria-labelledby="impact-title">
      {/* Light decorative field */}
      <div className="absolute inset-0 -z-20 bg-grid opacity-[0.25]" aria-hidden="true" />
      <div className="absolute -left-32 top-0 -z-10 h-[30rem] w-[30rem] rounded-full bg-primary-light/20 blur-[120px]" aria-hidden="true" />
      <div className="absolute -bottom-40 right-0 -z-10 h-[34rem] w-[34rem] rounded-full bg-primary-strong/15 blur-[130px]" aria-hidden="true" />
      <div className="absolute left-1/2 top-0 -z-10 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-primary/40 to-transparent" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <span className="eyebrow justify-center">Our impact</span>
          <h2 id="impact-title" className="mt-4 font-heading text-3xl font-extrabold leading-[1.15] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.9rem] text-balance">
            Measurable outcomes. <span className="text-gradient">Meaningful medicine.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate">
            Numbers tell part of the story. The rest is in the products that reach patients and the partners who trust us to get there.
          </p>
          <Link to="/testimonials" className="group mt-5 inline-flex items-center gap-2 text-sm font-bold text-primary transition-colors hover:text-primary-strong">
            Read client stories
            <ArrowRight size={16} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </Reveal>

        <Stagger className="mt-16 grid gap-10 sm:grid-cols-3 sm:gap-6" stagger={0.12}>
          {stats.map((stat, i) => (
            <StaggerItem key={stat.label}>
              <div className="relative text-center sm:text-left">
                {i > 0 && <span className="absolute -left-3 top-2 hidden h-16 w-px bg-primary/15 sm:block" aria-hidden="true" />}
                <div className="font-heading text-6xl font-extrabold leading-none tracking-[-0.05em] text-gradient sm:text-7xl">
                  <AnimatedCounter value={Number(stat.value) || 0} suffix={stat.suffix || ''} />
                </div>
                <div className="mt-4 text-base font-bold text-ink">{stat.label}</div>
                <p className="mx-auto mt-1.5 max-w-[15rem] text-sm leading-relaxed text-slate sm:mx-0">{stat.detail}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal delay={0.15} className="mt-20">
          <div className="relative overflow-hidden rounded-[1.75rem] border border-primary/10 bg-white/85 p-7 shadow-card backdrop-blur-xl sm:p-10">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary-light/20 blur-3xl" aria-hidden="true" />
            <div className="relative grid gap-9 lg:grid-cols-5 lg:items-center lg:gap-12">
              {/* Story */}
              <figure className="lg:col-span-3">
                <Quote size={30} className="text-primary-strong" aria-hidden="true" />
                <blockquote className="mt-3 font-heading text-xl font-bold leading-relaxed text-ink sm:text-2xl">
                  “{story.quote}”
                </blockquote>
                <figcaption className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-primary/10 pt-5">
                  <span>
                    <span className="block text-sm font-bold text-ink">{story.name}</span>
                    <span className="block text-xs text-slate">{story.role}</span>
                  </span>
                  <span className="flex gap-0.5" aria-label={`${story.rating || 5} out of 5 stars`}>
                    {Array.from({ length: story.rating || 5 }).map((_, s) => (
                      <Star key={s} size={15} className="fill-primary-strong text-primary-strong" aria-hidden="true" />
                    ))}
                  </span>
                </figcaption>
              </figure>

              {/* Achievements */}
              <div className="grid gap-3 sm:grid-cols-3 lg:col-span-2 lg:grid-cols-1">
                {[
                  { icon: CheckCircle2, title: 'Audited quality systems', desc: 'Documented and continuously improved' },
                  { icon: TrendingUp, title: 'Faster route to market', desc: 'Experienced regulatory navigation' },
                  { icon: Globe2, title: 'Regional reach', desc: 'Understanding East African markets' },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="flex items-center gap-4 rounded-xl border border-primary/10 bg-white p-4 shadow-soft">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
                      <Icon size={19} aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block text-sm font-bold text-ink">{title}</span>
                      <span className="block text-xs text-slate">{desc}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
