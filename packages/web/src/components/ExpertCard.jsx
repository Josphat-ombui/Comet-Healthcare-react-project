import { Link } from 'react-router-dom'
import { MapPin, Star, ArrowRight } from 'lucide-react'
import Badge from './ui/Badge.jsx'
import { SmartImage } from './ui/SmartImage.jsx'
import { useMedia } from '../context/ContentContext.jsx'
import { canonicalizeProvider } from '../lib/experts.js'

export default function ExpertCard({ expert, compact = false }) {
  const media = useMedia()
  const person = canonicalizeProvider(expert, media)

  return (
    <Link
      to={`/experts/${person.slug}`}
      className={`card card-hover group flex flex-col overflow-hidden ${compact ? 'p-5' : 'p-6'}`}
      aria-label={`View profile of ${person.name}`}
    >
      <div className="flex items-start gap-4">
        <SmartImage
          src={person.image}
          alt={`Portrait of ${person.name}`}
          className={`rounded-xl shrink-0 overflow-hidden ${compact ? 'w-14 h-14' : 'w-16 h-16'}`}
          imgClassName="w-full h-full object-cover"
        />
        <div className="min-w-0">
          <h3 className={`font-heading font-semibold text-ink group-hover:text-primary transition-colors ${compact ? 'text-base' : 'text-lg'}`}>
            {person.name}
          </h3>
          <p className="text-[13px] text-slate mt-0.5 leading-snug">{person.title}</p>
          <Badge tone="primary" className="mt-2">
            {person.specialty}
          </Badge>
        </div>
      </div>

      {!compact && person.bio && (
        <p className="text-sm text-slate leading-relaxed mt-4 line-clamp-3">{person.bio}</p>
      )}

      <div className={`flex items-center justify-between ${compact ? 'mt-3' : 'mt-5'} border-t border-mist/70 pt-3.5`}>
        <div className="flex items-center gap-3 text-xs text-slate">
          <span className="inline-flex items-center gap-1">
            <MapPin size={12} className="text-primary" aria-hidden="true" /> {person.location}
          </span>
          <span className="inline-flex items-center gap-1">
            <Star size={12} className="text-secondary fill-secondary" aria-hidden="true" />
            <strong className="text-ink">{Number(person.rating).toFixed(1)}</strong>
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary group-hover:gap-2 transition-all">
          View profile <ArrowRight size={13} aria-hidden="true" />
        </span>
      </div>
    </Link>
  )
}