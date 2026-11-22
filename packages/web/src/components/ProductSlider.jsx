// ProductSlider — large preview + filmstrip thumbnails for the products page.
// Handles up to 30 photos with arrow & drag navigation, keyboard support and
// a "n / total" counter so visitors can browse the whole range quickly.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function ProductSlider({ items = [] }) {
  const [active, setActive] = useState(0)
  const [thumbPos, setThumbPos] = useState(0)
  const stripRef = useRef(null)

  const count = items.length
  const go = useCallback((dir) => {
    setActive((i) => (i + dir + count) % count)
  }, [count])

  const scrollThumbs = (dir) => setThumbPos((p) => p + dir * 168)

  useEffect(() => {
    const strip = stripRef.current
    if (strip && typeof strip.scrollTo === 'function') strip.scrollTo({ left: thumbPos, behavior: 'smooth' })
  }, [thumbPos, active])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  if (count === 0) return null
  const current = items[active]

  return (
    <div className="grid lg:grid-cols-12 gap-6 items-start" role="region" aria-label="Product photo gallery">
      {/* Main preview */}
      <div className="lg:col-span-7">
        <div className="relative rounded-3xl overflow-hidden shadow-card border border-mist bg-primary-deeper group">
          <div className="aspect-[4/3.2]">
            <img
              src={current.image}
              alt={current.alt || ''}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-4 flex items-end justify-between">
            <p className="text-sm font-semibold text-white">{current.caption || current.alt || `Product ${active + 1}`}</p>
            <span className="text-xs text-white/80 bg-black/40 rounded-full px-2.5 py-1">{active + 1} / {count}</span>
          </div>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous photo"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 backdrop-blur border border-white/30 text-white flex items-center justify-center hover:bg-white/35 transition-colors cursor-pointer"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next photo"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 backdrop-blur border border-white/30 text-white flex items-center justify-center hover:bg-white/35 transition-colors cursor-pointer"
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Thumbnail filmstrip */}
      <div className="lg:col-span-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-ink font-heading">Browse the gallery</h3>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => scrollThumbs(-1)} aria-label="Scroll thumbs back" className="w-7 h-7 rounded-full border border-mist flex items-center justify-center text-slate hover:border-primary hover:text-primary transition-colors cursor-pointer">
              <ChevronLeft size={15} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => scrollThumbs(1)} aria-label="Scroll thumbs forward" className="w-7 h-7 rounded-full border border-mist flex items-center justify-center text-slate hover:border-primary hover:text-primary transition-colors cursor-pointer">
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div
          ref={stripRef}
          className="flex gap-3 overflow-x-auto pb-2 scrollbar-none snap-x"
          role="list"
          aria-label="Thumbnails"
        >
          {items.map((t, i) => (
            <button
              key={`${t.image}-${i}`}
              type="button"
              role="listitem"
              aria-label={t.alt || `Photo ${i + 1}`}
              aria-pressed={i === active}
              onClick={() => setActive(i)}
              className={`snap-start shrink-0 w-24 h-20 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                i === active ? 'border-primary shadow-lg scale-[1.02]' : 'border-transparent hover:border-primary/40'
              }`}
            >
              <img src={t.image} alt="" className="w-full h-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
        <p className="text-xs text-slate mt-3">Use the arrows, drag the strip, or press
          <kbd className="ml-1 px-1.5 py-0.5 rounded bg-cream border border-mist text-[10px] font-mono">←</kbd>
          <kbd className="ml-1 px-1.5 py-0.5 rounded bg-cream border border-mist text-[10px] font-mono">→</kbd>
          to move through all {count} photos.
        </p>
      </div>
    </div>
  )
}