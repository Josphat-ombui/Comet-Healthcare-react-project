import { Icon } from '../../lib/icons.jsx'
import { SmartImage } from '../ui/SmartImage.jsx'
import { Reveal, Stagger, StaggerItem } from '../home/motion.jsx'

export default function CultureMatters({ content }) {
  return (
    <section id="culture" className="relative isolate scroll-mt-36 overflow-hidden bg-cream py-20 lg:py-28" aria-labelledby="culture-matters-title">
      <div className="pointer-events-none absolute -right-40 top-0 h-[30rem] w-[30rem] rounded-full bg-primary-100/60 blur-[120px]" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <Reveal className="order-2 lg:order-1">
            <div className="relative grid grid-cols-5 gap-3">
              <div className="col-span-3 overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/70 p-1.5 shadow-card">
                <SmartImage
                  src={content.image}
                  alt={content.imageAlt || 'Comet Healthcare facility'}
                  className="h-64 rounded-[1.2rem] sm:h-80"
                  imgClassName="h-full w-full object-cover"
                />
              </div>
              <div className="col-span-2 mt-12 overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/70 p-1.5 shadow-card">
                <SmartImage
                  src={content.secondaryImage}
                  alt={content.secondaryImageAlt || 'Comet Healthcare team training'}
                  className="h-48 rounded-[1.2rem] sm:h-60"
                  imgClassName="h-full w-full object-cover"
                />
              </div>
              <div className="absolute bottom-3 left-3 rounded-full bg-gradient-to-r from-primary to-primary-strong px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white shadow-pop">
                {content.badge}
              </div>
            </div>
          </Reveal>

          <div className="order-1 lg:order-2">
            <Reveal>
              <span className="eyebrow">{content.eyebrow}</span>
              <h2 id="culture-matters-title" className="mt-4 font-heading text-3xl font-extrabold leading-[1.14] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.7rem] text-balance">
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

            <Stagger className="mt-8 space-y-3" delay={0.16} stagger={0.08}>
              {(content.commitments || []).map((item) => (
                <StaggerItem key={item.title} className="flex items-start gap-3 rounded-2xl border border-primary/10 bg-white/80 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
                    <Icon name={item.icon} size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-ink">{item.title}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-slate">{item.desc}</p>
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
