import { useRef, useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { Icon } from '../../lib/icons.jsx'
import Button from '../ui/Button.jsx'
import { SmartImage } from '../ui/SmartImage.jsx'
import { Reveal } from '../home/motion.jsx'

/** Accessible tabbed storytelling with full arrow-key, Home and End support. */
export default function FocusTabs({ content, items = [] }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const tabRefs = useRef([])
  const active = items[activeIndex] || items[0]

  if (!active) return null

  function handleKeyDown(event, index) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    let next = null

    if (step) next = (index + step + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1

    if (next === null) return
    event.preventDefault()
    setActiveIndex(next)
    requestAnimationFrame(() => tabRefs.current[next]?.focus())
  }

  return (
    <section id="focus" className="scroll-mt-36 overflow-hidden bg-white py-20 lg:py-28" aria-labelledby="mission-focus-title">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-3xl">
          <span className="eyebrow">{content.eyebrow}</span>
          <h2 id="mission-focus-title" className="mt-4 font-heading text-3xl font-extrabold leading-[1.15] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.7rem] text-balance">
            {content.title}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate">{content.lead}</p>
        </Reveal>

        <div role="tablist" aria-label="How Comet delivers" className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, i) => {
            const selected = i === activeIndex
            return (
              <button
                key={item.id}
                ref={(node) => { tabRefs.current[i] = node }}
                type="button"
                role="tab"
                id={`mission-focus-tab-${item.id}`}
                aria-controls={`mission-focus-panel-${item.id}`}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveIndex(i)}
                onKeyDown={(event) => handleKeyDown(event, i)}
                className={`group flex h-full items-start gap-3 rounded-2xl border p-4 text-left transition-all duration-300 ${
                  selected
                    ? 'border-primary bg-white shadow-card ring-1 ring-primary/20'
                    : 'border-mist/80 bg-cream/70 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white hover:shadow-card'
                }`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ${selected ? 'bg-gradient-to-br from-primary to-primary-strong text-white shadow-glow' : 'bg-primary-50 text-primary'}`}>
                  <Icon name={item.icon} size={19} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-heading text-sm font-extrabold leading-snug text-ink">{item.tabLabel}</span>
                  <span className="mt-1.5 block text-[12px] leading-relaxed text-slate">0{i + 1} / 04</span>
                </span>
              </button>
            )
          })}
        </div>

        {items.map((item, i) => {
          const selected = i === activeIndex
          if (!selected) {
            return (
              <div
                key={item.id}
                hidden
                id={`mission-focus-panel-${item.id}`}
                role="tabpanel"
                aria-labelledby={`mission-focus-tab-${item.id}`}
              />
            )
          }

          return (
            <div
              key={item.id}
              id={`mission-focus-panel-${item.id}`}
              role="tabpanel"
              aria-labelledby={`mission-focus-tab-${item.id}`}
              tabIndex={0}
              className="animate-fade-in-up mt-6 grid overflow-hidden rounded-[1.75rem] border border-primary/10 bg-cream shadow-card lg:grid-cols-[0.85fr_1.15fr]"
            >
              <div className="relative min-h-64 lg:min-h-[26rem]">
                <SmartImage
                  src={content.image}
                  alt={content.imageAlt}
                  className="absolute inset-0 h-full w-full"
                  imgClassName="h-full w-full object-cover brightness-[1.05]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-primary-deeper/65 via-transparent to-transparent" aria-hidden="true" />
                <span className="absolute bottom-5 left-5 rounded-full border border-white/60 bg-white/90 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-primary shadow-card backdrop-blur-md">
                  In practice
                </span>
              </div>

              <div className="flex flex-col justify-center p-7 sm:p-10">
                <span className="eyebrow">0{i + 1} / 04</span>
                <h3 className="mt-3 font-heading text-2xl font-extrabold leading-tight text-ink sm:text-3xl text-balance">{item.title}</h3>
                <p className="mt-5 text-sm leading-relaxed text-slate sm:text-[15px]">{item.body}</p>

                <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                  {(item.bullets || []).filter(Boolean).map((bullet, bulletIndex) => (
                    <li key={bulletIndex} className="flex items-start gap-2.5 rounded-xl border border-primary/10 bg-white/70 p-3">
                      <Check size={15} className="mt-0.5 shrink-0 text-primary-strong" aria-hidden="true" />
                      <span className="text-[13px] leading-relaxed text-ink/80">{bullet}</span>
                    </li>
                  ))}
                </ul>

                {item.action?.to && (
                  <Button to={item.action.to} variant="outline" size="md" className="mt-7 self-start">
                    {item.action.label} <ArrowRight size={16} aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
          )
        })}

        <p className="mt-4 text-center text-xs text-slate">Use the arrow keys to move between focus areas.</p>
      </div>
    </section>
  )
}
