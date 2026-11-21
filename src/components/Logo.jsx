import { useId } from 'react'

/**
 * Comet Healthcare brand mark — a "Comet C": navy→azure gradient tile, a white
 * crescent "C" ring, and a brass comet with a tapering tail sweeping through
 * the ring's opening. Reused inline so it can be retinted per context
 * (navbar, footer) without shipping duplicate SVG assets.
 */
export default function Logo({ lockup = true, onDark = false, markClassName = 'w-11 h-11 lg:w-12 lg:h-12' }) {
  const uid = useId()
  const tile = `${uid}-tile`
  const brass = `${uid}-brass`
  const tail = `${uid}-tail`

  return (
    <span className="inline-flex items-center gap-3">
      <svg
        viewBox="0 0 48 48"
        className={`${markClassName} drop-shadow-[0_12px_26px_-10px_rgba(20,71,135,0.55)] shrink-0`}
        role="img"
        aria-label="Comet Healthcare logo"
      >
        <defs>
          <linearGradient id={tile} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#081D3A" />
            <stop offset="0.55" stopColor="#144787" />
            <stop offset="1" stopColor="#2E6BC4" />
          </linearGradient>
          <linearGradient id={brass} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#E0A33A" />
            <stop offset="1" stopColor="#EEC26A" />
          </linearGradient>
          <linearGradient id={tail} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#E0A33A" />
            <stop offset="1" stopColor="#EEC26A" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="14" fill={`url(#${tile})`} />
        <rect width="48" height="48" rx="14" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
        <path
          d="M31 15 A11.5 11.5 0 1 0 31 33"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="4.25"
          strokeLinecap="round"
        />
        <path
          d="M33.5 28.6 C 28.5 33.4 22.5 33.8 17.5 30.4"
          fill="none"
          stroke={`url(#${tail})`}
          strokeWidth="3.4"
          strokeLinecap="round"
        />
        <path
          d="M31.8 29.4 C 28.4 32.2 24.6 32.5 21 30.9"
          fill="none"
          stroke="#EEC26A"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.85"
        />
        <circle cx="35.9" cy="27.6" r="2.7" fill={`url(#${brass})`} />
        <circle cx="35.5" cy="27" r="1.05" fill="#FFFFFF" opacity="0.9" />
        <path
          d="M11.5 14.5 L12.4 13.6 M12.4 15.4 L11.5 14.5 M11.5 13.6 L12.4 14.5"
          stroke={`url(#${brass})`}
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity="0.7"
        />
        <circle cx="38.5" cy="16.5" r="1.2" fill="#EEC26A" opacity="0.55" />
      </svg>

      {lockup && (
        <span className="leading-none text-left">
          <span
            className={`font-heading block text-lg lg:text-[1.35rem] font-bold tracking-tight ${
              onDark ? 'text-white' : 'text-ink'
            }`}
          >
            Comet
          </span>
          <span
            className={`block text-[10px] lg:text-[10.5px] tracking-[0.26em] uppercase font-semibold mt-1 ${
              onDark ? 'text-secondary-light' : 'text-primary-strong'
            }`}
          >
            Healthcare
          </span>
        </span>
      )}
    </span>
  )
}