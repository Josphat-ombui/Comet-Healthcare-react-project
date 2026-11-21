import { Icon } from '../../lib/icons.jsx'
import { Reveal, Stagger, StaggerItem } from '../home/motion.jsx'

export default function CultureValues({ content }) {
  return (
    <section id="values" className="relative isolate scroll-mt-36 overflow-hidden bg-gradient-to-br from-primary-deeper via-primary-dark to-primary py-20 lg:py-28" aria-labelledby="culture-values-title">
      <div className="absolute inset-0 -z-20 bg-mesh opacity-40" aria-hidden="true" />
      <div className="absolute inset-0 -z-20 bg-grid opacity-10" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-28 top-10 h-96 w-96 rounded-full bg-primary-light/20 blur-[120px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-white/10 blur-[110px]" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white shadow-card">
            {content.eyebrow}
          </span>
          <h2 id="culture-values-title" className="mt-6 font-heading text-3xl font-extrabold leading-[1.14] tracking-[-0.03em] text-white sm:text-4xl lg:text-[2.7rem] text-balance">
            {content.title}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/80">{content.lead}</p>
        </Reveal>

        <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5" delay={0.1} stagger={0.08}>
          {(content.items || []).map((item, i) => (
            <StaggerItem key={item.title} className="group h-full">
              <div className="glass h-full rounded-2xl border border-white/15 p-5 transition-all duration-300 group-hover:-translate-y-1 group-hover:bg-white/15">
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/25">
                    <Icon name={item.icon} size={20} aria-hidden="true" />
                  </span>
                  <span className="font-heading text-xs font-extrabold text-white/30">0{i + 1}</span>
                </div>
                <h3 className="mt-5 font-heading text-lg font-extrabold text-white">{item.title}</h3>
                <p className="mt-3 text-[13px] leading-relaxed text-white/75">{item.desc}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  )
}
