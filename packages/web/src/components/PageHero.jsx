// Reusable inner-page hero in the illuminated blue & white theme.
export default function PageHero({ eyebrow, title, lead, children, image, imageWebp, imageAlt, breadcrumb }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-white via-primary-50 to-primary-100">
      <div className="absolute inset-0 bg-grid opacity-20" aria-hidden="true" />
      <div className="absolute -top-24 -right-16 h-80 w-80 rounded-full bg-primary-light/20 blur-3xl" aria-hidden="true" />
      <div className="absolute -bottom-28 -left-20 h-96 w-96 rounded-full bg-primary-strong/10 blur-3xl" aria-hidden="true" />
      <div className="absolute left-1/2 top-1/2 h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/10" aria-hidden="true" />
      <div className="absolute left-1/2 top-1/2 h-[880px] w-[880px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/[0.06]" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            {breadcrumb && <div className="mb-5">{breadcrumb}</div>}
            {eyebrow && (
              <p className="eyebrow mb-4">{eyebrow}</p>
            )}
            <h1 className="font-heading text-3xl font-extrabold leading-tight tracking-[-0.03em] text-ink sm:text-4xl lg:text-5xl">
              {title}
            </h1>
            {lead && <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate">{lead}</p>}
            {children && <div className="mt-8 flex flex-wrap gap-3">{children}</div>}
          </div>
          {image && (
            <div className="relative hidden lg:block">
              <div className="rotate-1 overflow-hidden rounded-3xl border border-white/80 bg-white/70 p-2 shadow-card backdrop-blur-xl transition-transform duration-500 hover:rotate-0">
                <picture className="contents">
                  {imageWebp && <source type="image/webp" srcSet={imageWebp} />}
                  <img src={image} alt={imageAlt || ''} className="h-72 w-full rounded-2xl object-cover" loading="lazy" />
                </picture>
              </div>
              <div className="absolute -bottom-5 -left-5 h-40 w-40 rounded-full bg-primary-light/20 blur-2xl" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
