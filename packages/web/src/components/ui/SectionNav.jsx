import { useEffect, useState } from 'react'

/** Sticky, accessible in-page navigation with an IntersectionObserver-driven active state. */
export default function SectionNav({ sections = [] }) {
  const [active, setActive] = useState(sections[0]?.id || '')

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined
    if (!sections.length) return undefined

    const nodes = sections
      .map((section) => document.getElementById(section.id))
      .filter(Boolean)
    if (!nodes.length) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible?.target?.id) setActive(visible.target.id)
      },
      { rootMargin: '-140px 0px -62% 0px', threshold: [0, 0.15, 0.4, 0.75] }
    )

    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [sections])

  return (
    <nav
      aria-label="On this page"
      className="sticky top-[4.5rem] z-30 border-b border-mist/80 bg-white/90 shadow-[0_10px_30px_-24px_rgba(0,82,204,0.6)] backdrop-blur-xl lg:top-[5.25rem]"
    >
      <div className="absolute inset-x-1/4 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" aria-hidden="true" />
      <div className="scrollbar-none mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2.5 sm:px-6 lg:justify-center lg:px-8">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            onClick={() => setActive(section.id)}
            aria-current={active === section.id ? 'location' : undefined}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 sm:text-[13px] ${
              active === section.id
                ? 'bg-primary text-white shadow-[0_8px_18px_-8px_rgba(0,82,204,0.9)]'
                : 'text-slate hover:bg-primary-50 hover:text-primary'
            }`}
          >
            {section.label}
          </a>
        ))}
      </div>
    </nav>
  )
}
