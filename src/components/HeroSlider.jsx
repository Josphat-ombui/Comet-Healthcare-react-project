// HeroSlider — full-bleed photo slideshow for the home hero. Auto-advances,
// pauses on hover, supports arrows + dot navigation, and shows a slide counter.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function HeroSlider({ slides = [], interval = 6000, className = '' }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const timer = useRef(null)

  const count = slides.length
  const go = useCallback((dir) => {
    setIndex((i) => (i + dir + count) % count)
  }, [count])

  useEffect(() => {
    if (count < 2 || paused) return undefined
    timer.current = setInterval(() => setIndex((i) => (i + 1) % count), interval)
    return () => clearInterval(timer.current)
  }, [count, interval, paused, index])

  if (count === 0) return null

  return (
    <div
      className={`relative overflow-hidden rounded-3xl shadow-2xl ring-1 ring-white/20 ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="region"
      aria-label="Photo slideshow"
    >
      <div className="aspect-[4/3.4] w-full">
        {slides.map((s, i) => (
          <img
            key={s.image}
            src={s.image}
            alt={s.alt || ''}
            loading={i === 0 ? 'eager' : 'lazy'}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-[1200ms] ease-in-out ${
              i === index ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.04]'
            }`}
            aria-hidden={i !== index}
          />
        ))}
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-primary-deeper/60 via-transparent to-transparent pointer-events-none" />

      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous photo"
        className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/15 backdrop-blur border border-white/25 text-white flex items-center justify-center hover:bg-white/30 transition-colors cursor-pointer"
      >
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Next photo"
        className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/15 backdrop-blur border border-white/25 text-white flex items-center justify-center hover:bg-white/30 transition-colors cursor-pointer"
      >
        <ChevronRight size={18} aria-hidden="true" />
      </button>

      <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-2 px-3">
        <span className="text-[11px] font-semibold text-white/90 bg-black/35 backdrop-blur rounded-full px-2 py-0.5">
          {index + 1} / {count}
        </span>
        <div className="flex items-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.image}
              type="button"
              aria-label={`Go to photo ${i + 1}`}
              aria-pressed={i === index}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}