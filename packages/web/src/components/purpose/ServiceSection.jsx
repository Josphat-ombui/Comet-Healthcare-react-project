import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Icon } from '../../lib/icons.jsx'
import { Reveal, Stagger, StaggerItem } from '../home/motion.jsx'

export default function ServiceSection({ content }) {
  return (
    <section id="service" className="scroll-mt-36 bg-white py-20 lg:py-28" aria-labelledby="purpose-service-title">
      <div className="pointer-events-none absolute -left-40 top-20 h-96 w-96 rounded-full bg-primary-50/80 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <Reveal className="max-w-2xl">
            <span className="eyebrow">{content.eyebrow}</span>
            <h2 id="purpose-service-title" className="mt-4 font-heading text-3xl font-extrabold leading-[1.15] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.7rem] text-balance">
              {content.title}
            </h2>
          </Reveal>
          <Reveal delay={0.1} className="max-w-xl lg:text-right">
            <p className="text-sm leading-relaxed text-slate sm:text-[15px]">{content.lead}</p>
          </Reveal>
        </div>

        <Stagger className="mt-12 grid gap-5 md:grid-cols-3" stagger={0.08}>
          {content.items.map((item, i) => (
            <StaggerItem key={item.title}>
              <article className="group relative flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-mist/90 bg-cream/60 p-6 shadow-soft transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/25 hover:bg-white hover:shadow-card-hover">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-primary via-primary-light to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" aria-hidden="true" />
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-strong text-white shadow-[0_12px_24px_-12px_rgba(0,82,204,0.85)] transition-transform duration-300 group-hover:scale-110">
                    <Icon name={item.icon} size={21} aria-hidden="true" />
                  </span>
                  <span className="font-heading text-5xl font-extrabold leading-none text-primary/[0.07]">0{i + 1}</span>
                </div>
                <h3 className="mt-5 font-heading text-lg font-extrabold leading-snug text-ink sm:text-xl">
                  {item.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-slate sm:text-sm">{item.body}</p>
                <Link
                  to={item.to}
                  className="group/link mt-auto inline-flex items-center gap-2 pt-6 text-sm font-bold text-primary transition-colors hover:text-primary-strong"
                >
                  {item.linkLabel}
                  <ArrowRight size={15} aria-hidden="true" className="transition-transform duration-300 group-hover/link:translate-x-1" />
                </Link>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  )
}
