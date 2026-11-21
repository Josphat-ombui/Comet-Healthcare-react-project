import { useEffect, useState } from 'react'
import { ArrowRight, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api.js'
import Button from '../ui/Button.jsx'
import { SkeletonBlock } from '../ui/SmartImage.jsx'
import ExpertCard from '../ExpertCard.jsx'
import { Reveal } from '../home/motion.jsx'

export default function PeopleSection({ content }) {
  const [experts, setExperts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api
      .get('/providers?pageSize=3')
      .then((res) => {
        if (!active) return
        setExperts((res.items || []).slice(0, 3))
        setError('')
      })
      .catch(() => {
        if (active) setError('Our expert directory is temporarily unavailable.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  return (
    <section id="people" className="scroll-mt-36 bg-cream py-20 lg:py-28" aria-labelledby="purpose-people-title">
      <div className="pointer-events-none absolute -right-40 top-10 h-96 w-96 rounded-full bg-primary-50 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <Reveal className="max-w-2xl">
            <span className="eyebrow">{content.eyebrow}</span>
            <h2 id="purpose-people-title" className="mt-4 font-heading text-3xl font-extrabold leading-[1.15] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.7rem] text-balance">
              {content.title}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate sm:text-[15px]">{content.lead}</p>
          </Reveal>
          <Reveal delay={0.1}>
            <Link to="/experts" className="group inline-flex items-center gap-2 text-sm font-bold text-primary hover:text-primary-strong">
              {content.ctaLabel}
              <ArrowRight size={16} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </Reveal>
        </div>

        <div className="mt-11 grid gap-5 md:grid-cols-3" aria-busy={loading}>
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card p-6 space-y-4">
                  <div className="flex gap-4">
                    <SkeletonBlock className="h-16 w-16 rounded-xl" />
                    <div className="flex-1 space-y-2 pt-1">
                      <SkeletonBlock className="h-4 w-4/5" />
                      <SkeletonBlock className="h-3 w-3/5" />
                      <SkeletonBlock className="h-5 w-24 rounded-full" />
                    </div>
                  </div>
                  <SkeletonBlock className="h-3 w-full" />
                  <SkeletonBlock className="h-3 w-2/3" />
                </div>
              ))
            : experts.map((expert) => <ExpertCard key={expert.id} expert={expert} />)}
        </div>

        {!loading && (error || experts.length === 0) && (
          <div className="mt-11 flex flex-col items-center gap-4 rounded-2xl border border-mist bg-white px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary">
              <Users size={22} aria-hidden="true" />
            </span>
            <p className="text-sm text-slate">
              {error || 'Check back soon for the specialists behind our purpose.'}
            </p>
            <Button to="/experts" variant="outline" size="sm">
              View the expert directory <ArrowRight size={15} aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
