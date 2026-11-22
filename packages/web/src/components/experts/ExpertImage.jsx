// Picture wrapper that serves a WebP derivative when the browser supports it,
// while keeping the original JPEG as a fallback.
export default function ExpertImage({ src, webp, alt = '', className, ...props }) {
  return (
    <picture className="contents">
      {webp && <source type="image/webp" srcSet={webp} />}
      <img src={src} alt={alt} className={className} loading="lazy" decoding="async" {...props} />
    </picture>
  )
}
