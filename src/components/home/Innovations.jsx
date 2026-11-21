import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { Reveal, Stagger, StaggerItem } from './motion.jsx'
import { getInnovations } from './data.js'
import { useMedia } from '../../context/ContentContext.jsx'

export default function Innovations() {
  const media = useMedia()
  const innovations = getInnovations(media)
  return (
    <section id="innovations" className="relative overflow-hidden bg-cream py-24 lg:py-32" aria-labelledby="innovations-title">
      <div className="pointer-events-none absolute -right-32 top-10 h-96 w-96 rounded-full bg-primary-100/60 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <Reveal className="max-w-2xl">
            <span className="eyebrow">Featured innovations</span>
            <h2 id="innovations-title" className="mt-4 font-heading text-3xl font-extrabold leading-[1.15] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.9rem] text-balance">
              Capability you can see. <span className="text-gradient">Quality you can verify.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <Link to="/products" className="group inline-flex shrink-0 items-center gap-2 text-sm font-bold text-primary hover:text-primary-strong">
              Explore the portfolio
              <ArrowRight size={17} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </Reveal>
        </div>

        <Stagger className="mt-14 grid gap-6 md:grid-cols-3" stagger={0.11}>
          {innovations.map((item, i) => (
            <StaggerItem key={item.title}>
              <Link
                to="/products"
                className="group relative block h-full overflow-hidden rounded-[1.6rem] border border-mist/80 bg-white shadow-card transition-all duration-500 hover:-translate-y-2 hover:shadow-card-hover"
              >
                <div className="relative aspect-[4/3.1] overflow-hidden">
                  <img
                    src={item.image}
                    alt={item.title}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary-deeper/70 via-transparent to-transparent opacity-70 transition-opacity duration-500 group-hover:opacity-90" aria-hidden="true" />
                  <span className="absolute left-5 top-5 rounded-full border border-white/25 bg-white/15 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur-md">
                    {item.category}
                  </span>
                  <span className="absolute right-5 top-5 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-white text-primary opacity-0 shadow-glow transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </span>
                  <span className="absolute bottom-4 right-5 font-heading text-5xl font-extrabold leading-none text-white/15">0{i + 1}</span>
                </div>
                <div className="p-6 sm:p-7">
                  <h3 className="font-heading text-lg font-extrabold text-ink sm:text-xl">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate">{item.desc}</p>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-primary">
                    Learn more
                    <ArrowRight size={16} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  )
}
