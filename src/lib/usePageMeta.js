import { useEffect } from 'react'

/**
 * Route-level SEO metadata. The shell has sensible site-wide defaults in
 * index.html; a page can override the title/description while it is mounted
 * and everything is restored on unmount so client-side navigation stays clean.
 */
export default function usePageMeta({ title, description } = {}) {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined

    const previousTitle = document.title
    const descriptionTag = document.querySelector('meta[name="description"]')
    const previousDescription = descriptionTag?.getAttribute('content') || ''
    const ogTitle = document.querySelector('meta[property="og:title"]')
    const previousOgTitle = ogTitle?.getAttribute('content') || ''
    const twitterTitle = document.querySelector('meta[name="twitter:title"]')
    const previousTwitterTitle = twitterTitle?.getAttribute('content') || ''

    if (title) {
      document.title = `${title} | Comet Healthcare`
      ogTitle?.setAttribute('content', title)
      twitterTitle?.setAttribute('content', title)
    }
    if (description) {
      descriptionTag?.setAttribute('content', description)
      document.querySelector('meta[property="og:description"]')?.setAttribute('content', description)
      document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', description)
    }

    return () => {
      document.title = previousTitle
      descriptionTag?.setAttribute('content', previousDescription)
      ogTitle?.setAttribute('content', previousOgTitle)
      twitterTitle?.setAttribute('content', previousTwitterTitle)
    }
  }, [title, description])
}
