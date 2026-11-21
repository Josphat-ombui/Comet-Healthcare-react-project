import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Clock3 } from 'lucide-react'
import { Reveal, Stagger, StaggerItem } from './motion.jsx'
import { getInsights } from './data.js'
import { useMedia } from '../../context/ContentContext.jsx'

export default function Insights() {
  const media = useMedia()
  const insights = getInsights(media)
  return (
    <section id="insights" className="relative overflow-hidden bg-cream py-24 lg:py-32" aria-labelledby="insights-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <Reveal className="max-w-2xl">
            <span className="eyebrow">News &amp; insights</span>
            <h2 id="insights-title" className="mt-4 font-heading text-3xl font-extrabold leading-[1.15] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.9rem] text-balance">
              Thinking from the <span className="text-gradient">front line of pharma.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <Link to="/science" className="group inline-flex shrink-0 items-center gap-2 text-sm font-bold text-primary hover:text-primary-strong">
              More resources
              <ArrowRight size={17} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </Reveal>
        </div>

        <Stagger className="mt-14 grid gap-6 md:grid-cols-3" stagger={0.1}>
          {insights.map((article) => (
            <StaggerItem key={article.title}>
              <Link
                to={article.to}
                className="group flex h-full flex-col overflow-hidden rounded-[1.6rem] border border-mist/80 bg-white shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:shadow-card-hover"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <img
                    src={article.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary-deeper/45 to-transparent" aria-hidden="true" />
                  <span className="absolute left-5 top-5 rounded-full border border-white/25 bg-white/20 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur-md">
                    {article.category}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-6 sm:p-7">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate">
                    <Clock3 size={13} aria-hidden="true" /> 5 min read
                  </span>
                  <h3 className="mt-3 font-heading text-lg font-extrabold leading-snug text-ink transition-colors group-hover:text-primary sm:text-xl">
                    {article.title}
                  </h3>
                  <p className="mt-2.5 flex-1 text-sm leading-relaxed text-slate">{article.desc}</p>
                  <span className="mt-5 inline-flex items-center gap-2 border-t border-mist/80 pt-4 text-sm font-bold text-primary">
                    Read insight
                    <ArrowUpRight size={16} aria-hidden="true" className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
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
