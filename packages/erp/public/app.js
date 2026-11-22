// Phase 3 ERP shell. Uses the same JSON API as the storefront; no external deps.

const API = window.ERP_API_URL || 'http://localhost:4000/api'
const $ = (id) => document.getElementById(id)
let token = sessionStorage.getItem('comet_erp_token') || ''
let mfaChallenge = ''

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    credentials: 'include',
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`)
  return body
}

function showLogin(message = '') {
  $('loginPanel').hidden = false
  $('dashboard').hidden = true
  $('mfaForm').hidden = !mfaChallenge
  $('loginForm').hidden = Boolean(mfaChallenge)
  $('authError').textContent = message
}

function showDashboard(me) {
  $('loginPanel').hidden = true
  $('dashboard').hidden = false
  const name = `${me.user.firstName} ${me.user.lastName}`
  $('identity').innerHTML = `<span>${name} · ${me.user.role}</span><button id="logout" class="secondary" type="button">Sign out</button>`
  $('logout').onclick = () => {
    request('/auth/logout', { method: 'POST' }).catch(() => {})
    token = ''
    mfaChallenge = ''
    sessionStorage.removeItem('comet_erp_token')
    showLogin()
  }
}

async function loadDirectory() {
  const [users, branches, sessions] = await Promise.all([
    request('/identity/users'),
    request('/org/branches'),
    request('/auth/sessions'),
  ])
  $('userCount').textContent = `${users.users.length} users`
  $('userRows').innerHTML = users.users.map((user) => `
    <tr>
      <td>${user.firstName} ${user.lastName}</td>
      <td>${user.email}</td>
      <td>${user.role}</td>
      <td>${user.status}</td>
      <td>${branches.branches.find((b) => b.id === user.branchId)?.name || 'Organisation-wide'}</td>
      <td>${user.mfaEnabled ? 'Enabled' : 'Off'}</td>
    </tr>`).join('')
  $('branchList').innerHTML = branches.branches.map((branch) =>
    `<li><span>${branch.name}</span><span class="muted">${branch.code}</span></li>`).join('')
  $('sessionList').innerHTML = sessions.sessions.length
    ? sessions.sessions.map((session) => `
      <li>
        <span>${session.userAgent || 'Unknown device'}<br /><span class="muted">${new Date(session.createdAt).toLocaleString()}</span></span>
        <span>${session.current ? 'This device' : 'Other'}</span>
      </li>`).join('')
    : '<li class="muted">No active sessions</li>'
  $('revokeOthers').onclick = async () => {
    await request('/auth/sessions/revoke-others', { method: 'POST' })
    await loadDirectory()
  }
}

async function start() {
  try {
    const me = await request('/auth/me')
    showDashboard(me)
    await loadDirectory()
  } catch {
    token = ''
    sessionStorage.removeItem('comet_erp_token')
    showLogin()
  }
}

$('loginForm').onsubmit = async (event) => {
  event.preventDefault()
  $('authError').textContent = ''
  try {
    const result = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: $('email').value, password: $('password').value }),
    })
    if (result.mfaRequired) {
      mfaChallenge = result.challenge
      showLogin('Enter your authenticator code to continue.')
      $('code').focus()
      return
    }
    token = result.token
    sessionStorage.setItem('comet_erp_token', token)
    await start()
  } catch (error) {
    showLogin(error.message)
  }
}

$('mfaForm').onsubmit = async (event) => {
  event.preventDefault()
  try {
    const result = await request('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ challenge: mfaChallenge, code: $('code').value }),
    })
    token = result.token
    mfaChallenge = ''
    sessionStorage.setItem('comet_erp_token', token)
    await start()
  } catch (error) {
    $('authError').textContent = error.message
  }
}

$('ssoButton').onclick = async () => {
  try {
    const response = await fetch(`${API}/auth/oidc/start`, { redirect: 'manual', credentials: 'include' })
    const location = response.headers.get('location')
    if (response.status === 503) throw new Error('SSO is not configured on this server')
    if (location) window.location.href = location
  } catch (error) {
    showLogin(error.message)
  }
}

start()
