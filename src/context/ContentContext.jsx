// ContentContext — loads the CMS-driven site content once and shares it with
// every page. Pages read `site.<section>` (falling back to their own local
// defaults when the API is unavailable). The admin "Content Studio" calls
// `refresh()` after saving so changes appear immediately.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { applyMediaRegistry, resolveMedia } from '../lib/media.js'

const ContentContext = createContext({
  site: null,
  media: [],
  mediaRegistry: resolveMedia(),
  loading: true,
  refresh: async () => {},
})

export function ContentProvider({ children }) {
  const [site, setSite] = useState(null)
  const [media, setMedia] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async (opts) => {
    if (opts?.silent !== true) setLoading(true)
    try {
      const [s, m] = await Promise.all([
        api.get('/content/site'),
        api.get('/content/media'),
      ])
      setSite(s.site)
      setMedia(m.items || [])
    } catch {
      // Keep whatever we already have; pages fall back to local defaults.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const resolvedSite = useMemo(() => (site ? applyMediaRegistry(site) : site), [site])

  const value = useMemo(
    () => ({ site: resolvedSite, media, mediaRegistry: resolveMedia(resolvedSite?.media), loading, refresh }),
    [resolvedSite, media, loading, refresh]
  )
  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>
}

export function useContent() {
  return useContext(ContentContext)
}

/** The shared photo registry, including any Content Studio overrides. */
export function useMedia() {
  return useContext(ContentContext).mediaRegistry
}