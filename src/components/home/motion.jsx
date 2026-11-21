// Shared motion primitives for the homepage.
// Every animation collapses to a no-op when the visitor prefers reduced motion.
import { motion, useReducedMotion } from 'framer-motion'

const EASE = [0.22, 1, 0.36, 1]

export function Reveal({ children, delay = 0, y = 26, className = '', as = 'div', amount = 0.18 }) {
  const reduce = useReducedMotion()
  const Tag = motion[as] || motion.div
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: reduce ? 0 : 0.62, delay: reduce ? 0 : delay, ease: EASE }}
    >
      {children}
    </Tag>
  )
}

export function Stagger({ children, className = '', delay = 0, stagger = 0.09, amount = 0.12 }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: reduce ? 0 : stagger, delayChildren: reduce ? 0 : delay } },
      }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className = '', y = 22 }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: reduce ? 0 : y },
        show: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.55, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  )
}

export { EASE }
