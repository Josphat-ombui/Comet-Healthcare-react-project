import { ArrowRight, ArrowUpRight, FlaskConical } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Icon } from '../../lib/icons.jsx'
import { useMedia } from '../../context/ContentContext.jsx'
import { Reveal, Stagger, StaggerItem } from './motion.jsx'
import { photoSrc } from '../../lib/media.js'

const DEFAULT_ITEMS = [
  { icon: 'flask', title: 'CDMO & Contract Manufacturing', desc: 'End-to-end support from formulation and scale-up to packaging — one accountable partner for the whole drug lifecycle.' },
  { icon: 'file', title: 'Regulatory & Registration', desc: 'Dossier preparation, product registration and renewals across East Africa, handled by specialists who do it daily.' },
  { icon: 'shield', title: 'Quality Assurance & GMP', desc: 'Batch testing, SOPs, supplier verification and internal audits built on cGMP discipline practised for 20+ years.' },
  { icon: 'grad', title: 'Training & Digital Health', desc: 'Practical programmes for healthcare professionals and startups — regulatory compliance, digital tools and leadership.' },
]

export default function Solutions({ items = DEFAULT_ITEMS, heading = {} }) {
  const media = useMedia()
  const [featured, ...rest] = items.length ? items : DEFAULT_ITEMS

  return (
    <section id="solutions" className="relative overflow-hidden bg-white py-24 lg:py-32" aria-labelledby="solutions-title">
      <div className="pointer-events-none absolute -left-40 top-20 h-96 w-96 rounded-full bg-primary-50/70 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <Reveal className="max-w-2xl">
            <span className="eyebrow">{heading.eyebrow || 'What we do'}</span>
            <h2 id="solutions-title" className="mt-4 font-heading text-3xl font-extrabold leading-[1.15] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.9rem] text-balance">
              {heading.title || 'Everything your product needs, under one roof'}
            </h2>
          </Reveal>
          <Reveal delay={0.1} className="max-w-md lg:text-right">
            <p className="text-base leading-relaxed text-slate">
              {heading.lead || 'From pre-formulation to post-market surveillance, our senior specialists accelerate timelines and remove risk at every stage.'}
            </p>
          </Reveal>
        </div>

        <Stagger className="mt-14 grid gap-5 lg:grid-cols-12" stagger={0.1}>
          {/* Featured solution */}
          <StaggerItem className="lg:col-span-7">
            <div className="group relative h-full min-h-[26rem] overflow-hidden rounded-[1.75rem] border border-primary/10 bg-white shadow-card transition-all duration-500 hover:shadow-card-hover">
              <img
                src={photoSrc(media, 'site.lab')}
                alt="Quality control laboratory at Comet Healthcare"
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover brightness-[1.12] transition-transform duration-[1400ms] ease-out group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-white via-white/85 to-white/15" aria-hidden="true" />
              <div className="absolute inset-0 bg-mesh opacity-30" aria-hidden="true" />

              <div className="relative flex h-full flex-col justify-between p-7 sm:p-9">
                <div className="flex items-start justify-between gap-4">
                  <span className="glass-light inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-primary shadow-card">
                    <FlaskConical size={15} className="text-primary-strong" aria-hidden="true" />
                    Core capability
                  </span>
                  <span className="font-heading text-6xl font-extrabold leading-none text-primary/10">01</span>
                </div>

                <div className="max-w-md">
                  <h3 className="font-heading text-2xl font-extrabold leading-tight text-ink sm:text-3xl">
                    {featured.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate sm:text-base">{featured.desc}</p>
                  <Link
                    to="/services"
                    className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-primary shadow-glow transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary-50"
                  >
                    Explore this solution
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </StaggerItem>

          {/* Supporting solutions */}
          <div className="grid gap-5 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1">
            {rest.slice(0, 3).map((item, i) => (
              <StaggerItem key={item.title} className="h-full">
                <Link
                  to="/services"
                  className="group relative flex h-full items-start gap-5 overflow-hidden rounded-2xl border border-mist bg-cream/60 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/25 hover:bg-white hover:shadow-card-hover"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary transition-all duration-300 group-hover:bg-gradient-to-br group-hover:from-primary group-hover:to-primary-strong group-hover:text-white group-hover:shadow-glow">
                    <Icon name={item.icon} size={22} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-heading text-base font-bold text-ink sm:text-lg">{item.title}</span>
                      <span className="font-heading text-xs font-extrabold text-primary/30">0{i + 2}</span>
                    </span>
                    <span className="mt-1.5 block text-sm leading-relaxed text-slate">{item.desc}</span>
                  </span>
                  <ArrowUpRight size={18} className="absolute right-5 top-5 text-primary/0 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                </Link>
              </StaggerItem>
            ))}
          </div>
        </Stagger>

        <Reveal delay={0.2} className="mt-12 text-center">
          <Link
            to="/services"
            className="group inline-flex items-center gap-2 text-sm font-bold text-primary transition-colors hover:text-primary-strong"
          >
            View all services
            <ArrowRight size={17} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </Reveal>
      </div>
    </section>
  )
}
