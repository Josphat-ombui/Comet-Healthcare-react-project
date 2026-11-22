// Content Studio — the site CMS inside the admin portal.
//
// Four tabs:
//   1. "Shared photos" — change one portrait or facility photo and it updates
//      every page that uses that semantic key.
//   2. "Slides & photos" — friendly editors for the home-hero slideshow and
//      the Products gallery (up to 30). Photos are picked from the media
//      library or uploaded on the spot.
//   3. "Page content" — a structured editor that walks the full content tree
//      so almost every text part of the site can be edited without code.
//      A raw JSON editor is included for power users.
//   4. "Media library" — upload, browse and delete photos.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Images, Link2, Plus, RefreshCw, RotateCcw, Save, Trash2, Upload, X } from 'lucide-react'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Alert from '../../components/ui/Alert.jsx'
import { useContent } from '../../context/ContentContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { api, uploadMedia } from '../../lib/api.js'
import {
  DEFAULT_MEDIA, getAt, MEDIA_GROUPS, photoSrc, resolveMedia, updateSharedPhoto,
} from '../../lib/media.js'

/* ------------------------------------------------------------ path helpers */

const setIn = (obj, path, value) => {
  if (path.length === 0) return value
  const [head, ...rest] = path
  const base = Array.isArray(obj) ? [...obj] : { ...(obj || {}) }
  base[head] = setIn(obj?.[head], rest, value)
  return base
}

/* ---------------------------------------------------------- Media picker */

function MediaPicker({ open, onClose, onPick }) {
  const { media, refresh } = useContent()
  const { push } = useToast()
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [local, setLocal] = useState([])

  const items = local.length ? local : media

  useEffect(() => {
    if (open) setLocal([])
  }, [open])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const res = await uploadMedia(file, file.name)
      setLocal(res.items || media || [])
      refresh({ silent: true })
      push(`${res.name} uploaded`, 'success')
      onPick?.(res.url)
      onClose()
    } catch (err) {
      push(err.message, 'error')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Choose a photo">
      <div className="mb-5">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleUpload} />
        <Button variant="outline" size="sm" loading={busy} onClick={() => fileRef.current?.click()} className="w-full">
          <Upload size={15} aria-hidden="true" /> Upload a new photo
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate py-6 text-center">No photos in the library yet. Upload one above.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto pr-1">
          {items.map((m) => (
            <button
              key={m.url}
              type="button"
              onClick={() => { onPick?.(m.url); onClose() }}
              aria-label={`Select ${m.name}`}
              className="group relative aspect-square rounded-xl overflow-hidden border border-mist hover:border-primary hover:shadow-lg transition-all cursor-pointer"
            >
              <img src={m.url} alt={m.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
              <span className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-[10px] px-1.5 py-1 truncate">{m.name}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}

/* ----------------------------------------------- Slides / gallery editor */

function SlidesEditor({ label, value = [], onChange, limit = 12, hint, pickerKey }) {
  const [picking, setPicking] = useState(null)

  const replace = (i, patch) => onChange(value.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const move = (i, dir) => {
    const next = [...value]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <fieldset className="rounded-2xl border border-mist bg-white p-5 space-y-3">
      <legend className="px-2 text-sm font-semibold text-ink font-heading">{label} <span className="text-slate font-normal">({value.length}/{limit})</span></legend>
      {hint && <p className="text-xs text-slate -mt-2">{hint}</p>}

      {value.map((item, i) => (
        <div key={`${pickerKey}-${i}`} className="group flex gap-3 items-stretch rounded-xl border border-mist bg-cream/60 p-3">
          <img src={item.image} alt="" className="h-20 w-24 rounded-lg object-cover shrink-0 border border-mist" loading="lazy" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate bg-white border border-mist rounded-md px-1.5 py-0.5">#{i + 1}</span>
              <Button variant="outline" size="sm" onClick={() => setPicking(i)} className="!py-1">Change photo</Button>
            </div>
            <input
              className="input py-1.5 text-sm"
              value={item.alt || ''}
              placeholder="Alt text (accessibility)"
              onChange={(e) => replace(i, { alt: e.target.value })}
              aria-label={`Alt text for photo ${i + 1}`}
            />
            {'caption' in item && (
              <input
                className="input py-1.5 text-sm"
                value={item.caption || ''}
                placeholder="Caption shown under the photo"
                onChange={(e) => replace(i, { caption: e.target.value })}
                aria-label={`Caption for photo ${i + 1}`}
              />
            )}
          </div>
          <div className="flex flex-col justify-between shrink-0">
            <div className="flex flex-col gap-1">
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move earlier" className="w-7 h-7 rounded-lg border border-mist flex items-center justify-center text-slate hover:text-primary hover:border-primary disabled:opacity-30 transition-colors cursor-pointer">
                <ArrowUp size={14} aria-hidden="true" />
              </button>
              <button type="button" disabled={i === value.length - 1} onClick={() => move(i, 1)} aria-label="Move later" className="w-7 h-7 rounded-lg border border-mist flex items-center justify-center text-slate hover:text-primary hover:border-primary disabled:opacity-30 transition-colors cursor-pointer">
                <ArrowDown size={14} aria-hidden="true" />
              </button>
            </div>
            <button type="button" onClick={() => onChange(value.filter((_, idx) => idx !== i))} aria-label="Remove photo" className="w-7 h-7 rounded-lg border border-danger/30 flex items-center justify-center text-danger hover:bg-danger/10 transition-colors cursor-pointer">
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}

      {value.length < limit && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([...value, { image: photoSrc(DEFAULT_MEDIA, 'facility.hero'), alt: '', caption: '' }])}
        >
          <Plus size={15} aria-hidden="true" /> Add a photo
        </Button>
      )}

      <MediaPicker open={picking !== null} onClose={() => setPicking(null)} onPick={(url) => { if (picking !== null) replace(picking, { image: url }) }} />
    </fieldset>
  )
}

/* ------------------------------------------------- Generic JSON tree editor */

function JsonField({ label, type, value, onChange }) {
  if (type === 'text') {
    return (
      <label className="block">
        <span className="label">{label}</span>
        <textarea
          className="textarea !py-2 text-[13px]"
          rows={Math.min(6, Math.max(2, Math.ceil((value || '').length / 80)))}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    )
  }
  if (type === 'number') {
    return (
      <label className="block">
        <span className="label">{label}</span>
        <input type="number" className="input py-2 text-sm" value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} />
      </label>
    )
  }
  if (type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm font-medium text-ink">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-primary" />
        {label}
      </label>
    )
  }
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input py-2 text-sm" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

const prettyPath = (path) => path.join(' › ')

function JsonNodeEditor({ path, value, onChange }) {
  const key = path[path.length - 1]
  const label = String(key ?? '').replace(/^[a-z]/, (c) => c.toUpperCase()).replace(/[_-]+/g, ' ')

  if (Array.isArray(value)) {
    const isObjArr = value.some((v) => typeof v === 'object' && v !== null)
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wide text-primary-strong">{label} <span className="text-slate font-medium normal-case tracking-normal">(array · {value.length})</span></span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="px-2" onClick={() => onChange([...value, isObjArr ? {} : '']) }>
              <Plus size={14} aria-hidden="true" /> Add
            </Button>
            {value.length > 0 && (
              <Button variant="ghost" size="sm" className="px-2 text-danger" onClick={() => onChange([])}>
                Clear
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-2" data-path={path.join('.')}>
          {value.map((item, i) =>
            isObjArr ? (
              <div key={i} className="rounded-xl border border-mist bg-cream/50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate">#{i + 1}</span>
                  <div className="flex gap-1">
                    <button type="button" disabled={i === 0} onClick={() => { const n = [...value]; const j = i - 1; [n[i], n[j]] = [n[j], n[i]]; onChange(n) }} className="w-6 h-6 rounded-md border border-mist flex items-center justify-center text-slate disabled:opacity-30 hover:border-primary hover:text-primary cursor-pointer" aria-label="Move up">
                      <ArrowUp size={12} />
                    </button>
                    <button type="button" disabled={i === value.length - 1} onClick={() => { const n = [...value]; const j = i + 1; [n[i], n[j]] = [n[j], n[i]]; onChange(n) }} className="w-6 h-6 rounded-md border border-mist flex items-center justify-center text-slate disabled:opacity-30 hover:border-primary hover:text-primary cursor-pointer" aria-label="Move down">
                      <ArrowDown size={12} />
                    </button>
                    <button type="button" onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="w-6 h-6 rounded-md border border-danger/30 flex items-center justify-center text-danger hover:bg-danger/10 cursor-pointer" aria-label="Remove">
                      <X size={12} />
                    </button>
                    <button type="button" onClick={() => onChange([...value, { ...item }])} className="w-6 h-6 rounded-md border border-mist flex items-center justify-center text-slate hover:border-primary hover:text-primary cursor-pointer" aria-label="Duplicate">
                      <Copy size={12} />
                    </button>
                  </div>
                </div>
                <JsonNodeEditor path={[...path, i]} value={item} onChange={(v) => onChange(value.map((x, idx) => (idx === i ? v : x)))} />
              </div>
            ) : (
              <div key={i} className="flex items-center gap-2">
                <input className="input py-1.5 text-sm flex-1" value={String(item ?? '')} onChange={(e) => onChange(value.map((x, idx) => (idx === i ? e.target.value : x)))} aria-label={`${label} item ${i + 1}`} />
                <button type="button" onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="w-7 h-7 rounded-lg border border-danger/30 inline-flex items-center justify-center text-danger hover:bg-danger/10 cursor-pointer" aria-label="Remove">
                  <Trash2 size={13} />
                </button>
              </div>
            )
          )}
        </div>
      </div>
    )
  }

  if (value !== null && typeof value === 'object') {
    const isSlide = value.image && Object.keys(value).every((k) => ['image', 'alt', 'caption', 'title'].includes(k))
    return (
      <div className="rounded-xl border border-mist overflow-hidden">
        <div className="bg-cream px-3 py-2 text-xs font-bold text-slate flex items-center justify-between">
          <span>{label || prettyPath(path)}</span>
          {isSlide && <span className="text-[10px] font-normal">photo slide</span>}
        </div>
        <div className="p-3 space-y-3 bg-white">
          {(Object.entries(value) || []).map(([k, v]) => (
            <JsonNodeEditor key={k} path={[...path, k]} value={v} onChange={(nv) => onChange({ ...value, [k]: nv })} />
          ))}
        </div>
      </div>
    )
  }

  const isLong = typeof value === 'string' && value.length > 120
  const isBool = typeof value === 'boolean'
  const isNum = typeof value === 'number'
  return (
    <JsonField
      label={isLong ? `${label} — ${prettyPath(path) || label}` : label || prettyPath(path) || 'value'}
      type={isLong ? 'text' : isBool ? 'boolean' : isNum ? 'number' : 'string'}
      value={value}
      onChange={onChange}
    />
  )
}

/* ------------------------------------------------------ Shared photo editor */

function SharedPhotosEditor({ value = {}, onChange }) {
  const [picking, setPicking] = useState(null)
  const media = useMemo(() => resolveMedia(value), [value])

  // `value` is already the site's `media` branch — do not add a second one.
  const update = (path, patch) => onChange(updateSharedPhoto(value, path, patch))

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-primary/15 bg-primary-50 p-4 text-sm text-ink/80">
        <strong className="text-primary">One photo, one place.</strong> Each tile below is used by multiple pages. Replace it once here and the
        Team, Experts, Culture, Purpose, Mission, Home and Booking pages all update together.
      </div>

      {MEDIA_GROUPS.map((group) => (
        <fieldset key={group.id} className="rounded-2xl border border-mist bg-white p-5">
          <legend className="px-2 font-heading text-sm font-bold text-ink">{group.label}</legend>
          <p className="-mt-1 mb-4 text-xs text-slate">{group.hint}</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map(([path, label]) => {
              const src = photoSrc(media, path)
              const fallback = getAt(DEFAULT_MEDIA, path)
              const isDefault = src === fallback?.src
              return (
                <div key={path} className="overflow-hidden rounded-xl border border-mist bg-cream/50">
                  <img src={src} alt="" className="h-28 w-full bg-white object-cover" loading="lazy" />
                  <div className="space-y-2 p-3">
                    <p className="text-xs font-bold leading-snug text-ink">{label}</p>
                    <p className="truncate text-[10px] text-slate" title={src}>{src}</p>
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => setPicking(path)} className="!py-1">
                        Change photo
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isDefault}
                        onClick={() => update(path, fallback)}
                        className="!py-1"
                      >
                        <RotateCcw size={13} aria-hidden="true" /> Reset
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </fieldset>
      ))}

      <MediaPicker
        open={Boolean(picking)}
        onClose={() => setPicking(null)}
        onPick={(url) => {
          if (picking) update(picking, { src: url, webp: '' })
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------ Main studio */

const TABS = [
  { id: 'shared', label: 'Shared photos', icon: Link2 },
  { id: 'slides', label: 'Slides & photos', icon: Images },
  { id: 'content', label: 'Page content', icon: Copy },
  { id: 'media', label: 'Media library', icon: Images },
]

export default function ContentStudio() {
  const { refresh } = useContent()
  const { push } = useToast()
  const [tab, setTab] = useState('shared')
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [jsonDraft, setJsonDraft] = useState('')
  const [jsonTabMode, setJsonTabMode] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/content')
      setDraft(res.site)
      setJsonDraft(JSON.stringify(res.site, null, 2))
    } catch (err) {
      push(err.message || 'Could not load content', 'error')
    } finally {
      setLoading(false)
    }
  }, [push])

  useEffect(() => {
    load()
  }, [load])

  const setAt = useCallback(
    (path, value) => {
      setDraft((d) => setIn(d, path, value))
      setJsonDraft((j) => JSON.stringify(setIn(JSON.parse(j), path, value), null, 2))
    },
    []
  )

  const save = useCallback(async () => {
    if (!draft) return
    setSaving(true)
    try {
      await api.put('/admin/content', { site: draft })
      push('Site content saved — the website now shows your changes', 'success')
      refresh({ silent: true })
    } catch (err) {
      push(err.message || 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }, [draft, push, refresh])

  const resetDefaults = useCallback(async () => {
    if (!window.confirm('Reset all website text and shared photo selections back to the factory defaults? Uploaded photos stay in the media library. This cannot be undone.')) return
    setSaving(true)
    try {
      await api.post('/admin/content/reset')
      await load()
      push('Site content restored to defaults', 'info')
      refresh({ silent: true })
    } catch (err) {
      push(err.message || 'Reset failed', 'error')
    } finally {
      setSaving(false)
    }
  }, [load, push, refresh])

  const heroSlides = useMemo(() => draft?.home?.hero?.slides || [], [draft])
  const gallery = useMemo(() => draft?.products?.gallery?.items || [], [draft])

  if (loading) {
    return <div className="py-10 text-center text-sm text-slate">Loading content…</div>
  }
  if (!draft) {
    return <Alert type="error">Could not load site content from the server.</Alert>
  }

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-heading text-lg font-semibold text-ink">Content Studio</h2>
            <p className="text-sm text-slate">Every text block and photo on the public website is stored here. Edits go live the moment you save.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={resetDefaults}>
              <RefreshCw size={14} aria-hidden="true" /> Reset defaults
            </Button>
            <Button size="sm" loading={saving} onClick={save}>
              <Save size={14} aria-hidden="true" /> Save changes
            </Button>
          </div>
        </div>

        <div className="flex gap-1.5 bg-cream border border-mist rounded-xl p-1.5 w-fit" role="tablist" aria-label="Content studio sections">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${tab === t.id ? 'bg-primary text-white' : 'text-slate hover:text-primary'}`}>
              <t.icon size={15} aria-hidden="true" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'shared' && (
        <SharedPhotosEditor value={draft.media || {}} onChange={(v) => setAt(['media'], v)} />
      )}

      {tab === 'slides' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <SlidesEditor
            pickerKey="hero"
            label="Home hero slideshow"
            hint="Up to 10 photos. The homepage hero crossfades through these automatically — pick your strongest, clearest shots."
            value={heroSlides}
            limit={10}
            onChange={(v) => setAt(['home', 'hero', 'slides'], v)}
          />
          <SlidesEditor
            pickerKey="products"
            label="Products photo slider"
            hint="Up to 30 photos, order as you like (top photo shows first). Visitors scroll the strip on the products page."
            value={gallery}
            limit={30}
            onChange={(v) => setAt(['products', 'gallery', 'items'], v)}
          />
        </div>
      )}

      {tab === 'content' && (
        <div className="card p-5 space-y-5">
          <div className="rounded-xl bg-primary-50 border border-primary/15 p-4 text-sm text-ink/80">
            <strong className="text-primary">Page content.</strong> Edit any text on the site here — home headings, product marketing, about, mission, purpose, science, services, team and contact copy. Changes apply after you press <strong>Save changes</strong>.
          </div>

          {jsonTabMode ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate">Raw JSON of the whole content tree — advanced. Import your own file or edit directly.</p>
                <Button variant="outline" size="sm" onClick={() => setJsonTabMode(false)}>
                  <Copy size={14} aria-hidden="true" /> Back to structured editor
                </Button>
              </div>
              <textarea className="textarea font-mono text-xs leading-relaxed" style={{ minHeight: '50vh' }} value={jsonDraft} onChange={(e) => setJsonDraft(e.target.value)} aria-label="Raw JSON content" />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(jsonDraft)
                      setDraft(parsed)
                      setJsonTabMode(false)
                      push('JSON applied — press Save changes to publish', 'info')
                    } catch (err) {
                      push(`Invalid JSON: ${err.message}`, 'error')
                    }
                  }}
                >
                  Apply JSON
                </Button>
                <Button variant="outline" size="sm" onClick={() => setJsonDraft(JSON.stringify(draft, null, 2))}>Re-sync from editor</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setJsonTabMode(true)}>
                  <Copy size={14} aria-hidden="true" /> Advanced: raw JSON
                </Button>
              </div>
              <JsonNodeEditor path={[]} value={draft} onChange={(v) => { setDraft(v); setJsonDraft(JSON.stringify(v, null, 2)) }} />
            </>
          )}
        </div>
      )}

      {tab === 'media' && <MediaLibraryEditor />}
    </div>
  )
}

/* -------------------------------------------------------- Media library tab */

function MediaLibraryEditor() {
  const { media, refresh } = useContent()
  const { push } = useToast()
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [local, setLocal] = useState([])

  const items = local.length ? local : media

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const res = await uploadMedia(file, file.name)
      setLocal(res.items || media || [])
      refresh({ silent: true })
      push(`${res.name} uploaded`, 'success')
    } catch (err) {
      push(err.message, 'error')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function remove(item) {
    if (!window.confirm(`Delete ${item.name}? Photos still used on the site are protected from deletion.`)) return
    try {
      const res = await api.post('/admin/media/delete', { url: item.url })
      const list = res.items || items
      setLocal(list.filter((x) => x.url !== item.url))
      push('Photo deleted', 'info')
      refresh({ silent: true })
    } catch (err) {
      push(err.message, 'error')
    }
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="font-heading font-semibold text-ink">Media library</h3>
          <p className="text-sm text-slate">{items.length} photos available for the hero and product sliders.</p>
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleUpload} />
        <Button variant="secondary" size="sm" loading={busy} onClick={() => fileRef.current?.click()}>
          <Upload size={15} aria-hidden="true" /> Upload photo
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate py-8 text-center">No photos yet — upload your manufacturing, quality and product shots here, then use them in the slides.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          {items.map((m) => (
            <div key={m.url} className="group relative">
              <div className="aspect-square rounded-xl overflow-hidden border border-mist">
                <img src={m.url} alt={m.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
              </div>
              <button
                type="button"
                onClick={() => remove(m)}
                aria-label={`Delete ${m.name}`}
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/45 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-danger transition-all cursor-pointer"
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
              <p className="text-[10px] text-slate mt-1 truncate" title={`${m.name} · ${(m.size / 1024 / 1024).toFixed(1)} MB`}>{m.name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}