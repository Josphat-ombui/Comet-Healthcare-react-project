import { useRef, useState } from 'react'
import { ArrowRight, BadgeCheck } from 'lucide-react'
import { Icon } from '../../lib/icons.jsx'
import Button from '../ui/Button.jsx'
import { SmartImage } from '../ui/SmartImage.jsx'
import { Reveal } from '../home/motion.jsx'

/** Accessible tabbed storytelling: tabs are fully keyboard navigable. */
export default function PrinciplesSection({ items = [] }) {
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
    <section id="principles" className="scroll-mt-36 overflow-hidden bg-cream py-20 lg:py-28" aria-labelledby="purpose-principles-title">
      <div className="pointer-events-none absolute -right-32 top-10 h-96 w-96 rounded-full bg-primary-100/70 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-3xl">
          <span className="eyebrow">What guides us</span>
          <h2 id="purpose-principles-title" className="mt-4 font-heading text-3xl font-extrabold leading-[1.15] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.7rem] text-balance">
            Three principles. One promise to patients and partners.
          </h2>
        </Reveal>

        <div role="tablist" aria-label="Our guiding principles" className="mt-10 grid gap-3 sm:grid-cols-3">
          {items.map((item, i) => {
            const selected = i === activeIndex
            return (
              <button
                key={item.id}
                ref={(node) => { tabRefs.current[i] = node }}
                type="button"
                role="tab"
                id={`purpose-tab-${item.id}`}
                aria-controls={`purpose-panel-${item.id}`}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveIndex(i)}
                onKeyDown={(event) => handleKeyDown(event, i)}
                className={`group relative flex h-full w-full items-start gap-3 rounded-2xl border p-4 text-left transition-all duration-300 sm:p-5 ${
                  selected
                    ? 'border-primary bg-white shadow-card ring-1 ring-primary/20'
                    : 'border-mist/80 bg-white/60 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white hover:shadow-card'
                }`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ${selected ? 'bg-gradient-to-br from-primary to-primary-strong text-white shadow-glow' : 'bg-primary-50 text-primary'}`}>
                  <Icon name={item.icon} size={19} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-heading text-sm font-extrabold leading-snug text-ink sm:text-base">{item.tabLabel}</span>
                    <span className="font-heading text-[11px] font-extrabold text-primary/30">{item.number}</span>
                  </span>
                  <span className="mt-1.5 block text-[12px] leading-relaxed text-slate sm:text-[13px]">{item.summary}</span>
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
                id={`purpose-panel-${item.id}`}
                role="tabpanel"
                aria-labelledby={`purpose-tab-${item.id}`}
              />
            )
          }

          return (
            <div
              key={item.id}
              id={`purpose-panel-${item.id}`}
              role="tabpanel"
              aria-labelledby={`purpose-tab-${item.id}`}
              tabIndex={0}
              className="animate-fade-in-up mt-6 grid overflow-hidden rounded-[1.75rem] border border-primary/10 bg-white shadow-card lg:grid-cols-2"
            >
              <div className="relative min-h-64 overflow-hidden lg:min-h-[24rem]">
                <SmartImage
                  src={item.image}
                  alt={item.imageAlt}
                  className="absolute inset-0 h-full w-full"
                  imgClassName="h-full w-full object-cover brightness-[1.06]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-primary-deeper/60 via-transparent to-transparent" aria-hidden="true" />
                <span className="absolute bottom-5 left-5 rounded-full border border-white/60 bg-white/90 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-primary shadow-card backdrop-blur-md">
                  {item.kicker}
                </span>
              </div>

              <div className="flex flex-col justify-center p-7 sm:p-10">
                <span className="eyebrow">{item.number} / 03</span>
                <h3 className="mt-3 font-heading text-2xl font-extrabold leading-tight text-ink sm:text-3xl text-balance">
                  {item.title}
                </h3>
                <p className="mt-5 text-sm leading-relaxed text-slate sm:text-[15px]">{item.body}</p>
                <div className="mt-6 flex items-start gap-3 rounded-2xl border border-primary/10 bg-primary-50/70 p-4">
                  <BadgeCheck size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                  <p className="text-[13px] font-semibold leading-relaxed text-ink/80">{item.proof}</p>
                </div>
                <Button to={item.action.to} variant="outline" size="md" className="mt-7 self-start">
                  {item.action.label} <ArrowRight size={16} aria-hidden="true" />
                </Button>
              </div>
            </div>
          )
        })}

        <p className="mt-4 text-center text-xs text-slate">
          Use the arrow keys to move between principles.
        </p>
      </div>
    </section>
  )
}
