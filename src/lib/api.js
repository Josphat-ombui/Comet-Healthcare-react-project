// Tiny fetch wrapper. Attaches the JWT, parses JSON, and turns HTTP errors and
// Zod field errors into a shape the UI can render.

const TOKEN_KEY = 'comet.token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

/** Flatten server `issues: [{path, message}]` into { fieldName: message }. */
export function fieldErrorsFrom(res) {
  const result = {}
  for (const issue of res.issues || []) {
    if (issue.path && !result[issue.path]) result[issue.path] = issue.message
  }
  return result
}

export async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const authToken = token ?? getToken()
  if (authToken) headers.Authorization = `Bearer ${authToken}`

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (!res.ok) {
    const error = new Error(data?.error || 'Something went wrong. Please try again.')
    error.status = res.status
    error.data = data
    throw error
  }
  return data
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
}

/** Upload a raw image file to the admin media library. Returns {url, name, items}. */
export async function uploadMedia(file, name = file.name) {
  const res = await fetch(`/api/admin/media/upload?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': file.type,
    },
    body: file,
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  if (!res.ok) {
    const error = new Error(data?.error || 'Upload failed — please try a JPG, PNG, WebP or GIF under 25MB.')
    error.status = res.status
    error.data = data
    throw error
  }
  return data
}