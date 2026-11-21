import { Star, Quote } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import PageHero from '../components/PageHero.jsx'
import SectionReveal from '../components/SectionReveal.jsx'
import { SkeletonBlock } from '../components/ui/SmartImage.jsx'
import Button from '../components/ui/Button.jsx'

export default function Testimonials() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    api
      .get('/content/testimonials')
      .then((res) => active && setItems(res.items))
      .catch(() => {})
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  return (
    <>
      <PageHero
        eyebrow="Client Stories"
        title="The partners and facilities who trust Comet"
        lead="Genuine feedback from the hospital systems, distributors and innovators we work with across Kenya and East Africa."
      >
        <Button to="/book" size="lg">
          Start a conversation
        </Button>
      </PageHero>

      <section className="py-20 lg:py-24 bg-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="card p-7 space-y-4">
                    <SkeletonBlock className="h-20 w-full" />
                    <SkeletonBlock className="h-4 w-1/2" />
                  </div>
                ))
              : items.map((t, i) => (
                  <SectionReveal key={t.id} delay={(i % 3) * 80}>
                    <figure className="card card-hover p-7 h-full flex flex-col">
                      <Quote size={24} className="text-secondary mb-3" aria-hidden="true" />
                      <blockquote className="text-sm text-ink/85 leading-relaxed flex-1">"{t.quote}"</blockquote>
                      <figcaption className="mt-5 pt-4 border-t border-mist/70 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-bold text-ink">{t.name}</div>
                          <div className="text-xs text-slate mt-0.5">{t.role}</div>
                        </div>
                        <div className="flex gap-0.5" aria-label={`${t.rating} out of 5 stars`}>
                          {Array.from({ length: t.rating }).map((_, s) => (
                            <Star key={s} size={14} className="text-secondary fill-secondary" aria-hidden="true" />
                          ))}
                        </div>
                      </figcaption>
                    </figure>
                  </SectionReveal>
                ))}
          </div>
          {!loading && items.length === 0 && (
            <p className="text-center text-slate">Testimonials are on the way — check back soon.</p>
          )}
        </div>
      </section>
    </>
  )
}