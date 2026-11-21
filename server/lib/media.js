// Media library — the photo pool stored in public/images/gallery/.
// The frontend picks hero/product photos from this library and the admin can
// upload/delete images here. In dev, Vite serves /images from public/; in
// production the Express server serves the same folder (see server/index.js).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const GALLERY_DIR = path.resolve(__dirname, '../../public/images/gallery')

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
export const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export function ensureGalleryDir() {
  fs.mkdirSync(GALLERY_DIR, { recursive: true })
}

/** List the media library sorted by name. Returns [{ url, name, size, mtime }]. */
export function listMedia() {
  ensureGalleryDir()
  return fs
    .readdirSync(GALLERY_DIR)
    .filter((f) => ALLOWED_EXT.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const stat = fs.statSync(path.join(GALLERY_DIR, name))
      return {
        url: `/images/gallery/${encodeURIComponent(name)}`,
        name,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
      }
    })
}

/** Persist a raw image buffer under a unique name. Returns the public URL. */
export function saveMedia(buffer, ext, originalName) {
  ensureGalleryDir()
  const safeExt = ALLOWED_EXT.has(ext) ? ext : '.jpg'
  const base = path.basename(originalName || '', path.extname(originalName || '')).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 40)
  const stamp = Date.now()
  const name = `${base ? `${base}-` : ''}${stamp}${safeExt}`
  const full = path.join(GALLERY_DIR, name)
  fs.writeFileSync(full, buffer)
  return `/images/gallery/${name}`
}

/** Delete a media file by public URL. Returns false if it didn't exist. */
export function deleteMedia(url) {
  const name = path.basename(url)
  if (!ALLOWED_EXT.has(path.extname(name).toLowerCase())) return false
  ensureGalleryDir()
  const full = path.join(GALLERY_DIR, name)
  const resolved = path.resolve(full)
  if (!resolved.startsWith(path.resolve(GALLERY_DIR))) return false
  if (!fs.existsSync(resolved)) return false
  fs.unlinkSync(resolved)
  return true
}