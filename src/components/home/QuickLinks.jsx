import { Link } from 'react-router-dom'
import { ArrowUpRight, CalendarDays, Layers3, Users } from 'lucide-react'
import { Reveal, Stagger, StaggerItem } from './motion.jsx'

const ACTIONS = [
  {
    icon: CalendarDays,
    eyebrow: 'Start here',
    title: 'Book a consultation',
    desc: 'Pick a live slot with the specialist who owns your question.',
    to: '/book',
    theme: 'deep',
  },
  {
    icon: Layers3,
    eyebrow: 'Explore',
    title: 'See what we do',
    desc: 'Manufacturing, registration, quality and training under one roof.',
    to: '/services',
    theme: 'light',
  },
  {
    icon: Users,
    eyebrow: 'Meet the team',
    title: 'Talk to an expert',
    desc: 'Senior scientists and regulators, available for direct consultation.',
    to: '/experts',
    theme: 'plain',
  },
]

const THEMES = {
  deep: 'bg-blue-deep text-white border-primary-deeper shadow-deep',
  light: 'bg-gradient-to-br from-primary-50 via-ice to-primary-100 text-ink border-primary/15 shadow-card',
  plain: 'bg-white text-ink border-mist shadow-card',
}

export default function QuickLinks() {
  return (
    <section id="next-steps" className="relative overflow-hidden border-b border-mist/80 bg-white py-16 lg:py-20" aria-labelledby="next-steps-title">
      <div className="absolute inset-0 bg-blue-field opacity-70" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mb-9 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="eyebrow-line">Your next step</span>
            <h2 id="next-steps-title" className="mt-4 font-heading text-2xl font-extrabold leading-tight tracking-[-0.03em] text-ink sm:text-3xl">
              Three ways to move your product <span className="text-gradient-blue">forward.</span>
            </h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-slate sm:text-right">
            No call centre, no guesswork. Choose the route that fits where you are today.
          </p>
        </Reveal>

        <Stagger className="grid gap-5 md:grid-cols-3" stagger={0.1}>
          {ACTIONS.map(({ icon: Icon, eyebrow, title, desc, to, theme }) => (
            <StaggerItem key={title} className="h-full">
              <Link
                to={to}
                className={`group relative flex h-full flex-col overflow-hidden rounded-[1.5rem] border p-6 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-card-hover sm:p-7 ${THEMES[theme]}`}
              >
                {theme === 'deep' && (
                  <span className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-azure/25 blur-3xl" aria-hidden="true" />
                )}
                <span className="relative flex items-start justify-between gap-4">
                  <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                    theme === 'deep' ? 'bg-white/15 text-white ring-1 ring-white/25' : 'bg-primary-50 text-primary'
                  }`}>
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <span className={`font-heading text-[11px] font-bold uppercase tracking-[0.18em] ${
                    theme === 'deep' ? 'text-white/70' : 'text-primary/70'
                  }`}>
                    {eyebrow}
                  </span>
                </span>

                <span className="relative mt-7 block font-heading text-xl font-extrabold tracking-[-0.02em] sm:text-2xl">
                  {title}
                </span>
                <span className={`relative mt-2 block flex-1 text-sm leading-relaxed ${
                  theme === 'deep' ? 'text-white/75' : 'text-slate'
                }`}>
                  {desc}
                </span>
                <span className={`relative mt-6 inline-flex items-center gap-2 text-sm font-bold ${
                  theme === 'deep' ? 'text-white' : 'text-primary'
                }`}>
                  Go now
                  <ArrowUpRight size={17} aria-hidden="true" className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </span>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  )
}
