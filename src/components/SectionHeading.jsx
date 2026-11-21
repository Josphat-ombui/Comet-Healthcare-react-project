export default function SectionHeading({ eyebrow, title, lead, center = false, className = '' }) {
  return (
    <div className={`max-w-2xl ${center ? 'mx-auto text-center' : ''} ${className}`}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h2 className="font-heading text-3xl sm:text-4xl font-bold text-ink mt-3 leading-tight text-balance">{title}</h2>
      {lead && <p className="text-slate text-base sm:text-lg mt-4 leading-relaxed">{lead}</p>}
    </div>
  )
}

export function EyebrowCard({ icon: Icon, title, desc, className = '' }) {
  return (
    <div className={`card p-6 ${className}`}>
      <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-primary transition-colors">
        <Icon size={22} className="text-primary" aria-hidden="true" />
      </div>
      <h3 className="font-heading text-lg font-semibold text-ink mb-1.5">{title}</h3>
      <p className="text-sm text-slate leading-relaxed">{desc}</p>
    </div>
  )
}