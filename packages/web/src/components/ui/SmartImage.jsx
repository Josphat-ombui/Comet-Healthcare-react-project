import { useState, useEffect } from 'react'

function useImageLoaded(src) {
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!src) return undefined
    let active = true
    const img = new Image()
    img.onload = () => active && setLoaded(true)
    img.onerror = () => active && setLoaded(true) // render img anyway and let it 404
    img.src = src
    return () => {
      active = false
    }
  }, [src])
  return loaded
}

// Lazy image with a skeleton placeholder — keeps CLS low and pages feeling fast.
export function SmartImage({ src, alt, className = '', imgClassName = '', eager = false, ...rest }) {
  const loaded = useImageLoaded(src)
  return (
    <div className={`relative overflow-hidden ${className}`} {...rest}>
      {!loaded && <div className="skeleton absolute inset-0" aria-hidden="true" />}
      <img
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className={`relative transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'} ${imgClassName}`}
      />
    </div>
  )
}

export function SkeletonBlock({ className = '', ...rest }) {
  return <div className={`skeleton rounded-xl ${className}`} {...rest} />
}

export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton rounded-md h-3.5" style={{ width: `${100 - i * 14}%` }} />
      ))}
    </div>
  )
}