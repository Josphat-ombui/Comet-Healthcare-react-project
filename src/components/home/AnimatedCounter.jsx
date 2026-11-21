import { useEffect, useRef } from 'react'
import { animate, useInView, useReducedMotion } from 'framer-motion'

/** Counts from 0 → value the first time it scrolls into view. */
export default function AnimatedCounter({ value, suffix = '', prefix = '', duration = 1.9 }) {
  const ref = useRef(null)
  const numberRef = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.5 })
  const reduce = useReducedMotion()

  useEffect(() => {
    if (!inView || !numberRef.current) return undefined
    const node = numberRef.current
    if (reduce) {
      node.textContent = String(value)
      return undefined
    }
    const controls = animate(0, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => { node.textContent = String(Math.round(latest)) },
    })
    return () => controls.stop()
  }, [inView, value, duration, reduce])

  return (
    <span ref={ref} aria-label={`${prefix}${value}${suffix}`}>
      <span aria-hidden="true">{prefix}<span ref={numberRef}>0</span>{suffix}</span>
    </span>
  )
}
