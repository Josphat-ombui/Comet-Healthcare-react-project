// Phase 4 ERP shell: identity, directory and the internal messaging inbox.
// Uses the same JSON API as the storefront; no external dependencies. The
// Socket.IO client is served by the realtime service itself, and the inbox
// falls back to authenticated polling when sockets are unavailable.

const API = window.ERP_API_URL || 'http://localhost:4000/api'
const REALTIME = window.ERP_REALTIME_URL || 'http://localhost:4001'
const POLL_MS = 6000
const QUEUE_KEY = 'comet_erp_message_queue'
const $ = (id) => document.getElementById(id)

let token = sessionStorage.getItem('comet_erp_token') || ''
let mfaChallenge = ''
let me = null
let socket = null
let pollTimer = null
let typingTimer = null
let users = []
const state = {
  threads: [],
  thread: null,
  messages: [],
  presence: new Set(),
  typing: null,
  read: new Set(),
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char])
}

function idempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `key_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      credentials: 'include',
    })
  } catch (error) {
    error.offline = true
    throw error
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status})`)
    error.status = response.status
    error.details = body
    throw error
  }
  return body
}

function setConnection(label, isLive = false) {
  const el = $('connection')
  el.textContent = label
  el.classList.toggle('live', isLive)
}

// ------------------------------------------------------------------ auth

function showLogin(message = '') {
  $('loginPanel').hidden = false
  $('dashboard').hidden = true
  $('mfaForm').hidden = !mfaChallenge
  $('loginForm').hidden = Boolean(mfaChallenge)
  $('authError').textContent = message
  setConnection('Offline')
}

function showDashboard(profile) {
  me = profile
  $('loginPanel').hidden = true
  $('dashboard').hidden = false
  const name = `${profile.user.firstName} ${profile.user.lastName}`
  $('identity').innerHTML = `<span>${escapeHtml(name)} · ${escapeHtml(profile.user.role)}</span><button id="logout" class="secondary" type="button">Sign out</button>`
  $('logout').onclick = () => {
    request('/auth/logout', { method: 'POST' }).catch(() => {})
    disconnectRealtime()
    token = ''
    mfaChallenge = ''
    me = null
    users = []
    state.threads = []
    state.thread = null
    state.messages = []
    state.read.clear()
    localStorage.removeItem(QUEUE_KEY)
    sessionStorage.removeItem('comet_erp_token')
    showLogin()
  }
}

// --------------------------------------------------------------- directory

async function loadDirectory() {
  const [userResult, branchResult, sessionResult] = await Promise.allSettled([
    request('/identity/users'),
    request('/org/branches'),
    request('/auth/sessions'),
  ])
  if (userResult.status === 'fulfilled') {
    users = userResult.value.users
    $('userCount').textContent = `${users.length} users`
    $('userRows').innerHTML = users.map((user) => `
      <tr>
        <td>${escapeHtml(user.firstName)} ${escapeHtml(user.lastName)}</td>
        <td>${escapeHtml(user.email)}</td>
        <td>${escapeHtml(user.role)}</td>
        <td>${escapeHtml(user.status)}</td>
        <td>${escapeHtml(branchResult.status === 'fulfilled' ? (branchResult.value.branches.find((b) => b.id === user.branchId)?.name || 'Organisation-wide') : '—')}</td>
        <td>${user.mfaEnabled ? 'Enabled' : 'Off'}</td>
      </tr>`).join('')
    renderAssignOptions()
  } else {
    users = []
    $('userCount').textContent = 'Not available'
    $('userRows').innerHTML = '<tr><td colspan="6" class="muted">Your role cannot read the user directory.</td></tr>'
  }
  $('branchList').innerHTML = branchResult.status === 'fulfilled'
    ? branchResult.value.branches.map((branch) =>
      `<li><span>${escapeHtml(branch.name)}</span><span class="muted">${escapeHtml(branch.code)}</span></li>`).join('')
    : '<li class="muted">Branches are not available for this role.</li>'
  $('sessionList').innerHTML = sessionResult.status === 'fulfilled' && sessionResult.value.sessions.length
    ? sessionResult.value.sessions.map((session) => `
      <li>
        <span>${escapeHtml(session.userAgent || 'Unknown device')}<br /><span class="muted">${new Date(session.createdAt).toLocaleString()}</span></span>
        <span>${session.current ? 'This device' : 'Other'}</span>
      </li>`).join('')
    : '<li class="muted">No active sessions</li>'
  $('revokeOthers').onclick = async () => {
    try {
      await request('/auth/sessions/revoke-others', { method: 'POST' })
      await loadDirectory()
    } catch (error) {
      $('inboxError').textContent = error.message
    }
  }
}

function renderAssignOptions() {
  const select = $('assignSelect')
  select.innerHTML = users.map((user) =>
    `<option value="${escapeHtml(user.id)}">${escapeHtml(user.firstName)} ${escapeHtml(user.lastName)}</option>`).join('')
}

// ------------------------------------------------------------------- inbox

function canManage() {
  return Boolean(me?.roles?.some((role) => ['ADMIN', 'MANAGER'].includes(role)))
}

function renderThreads() {
  const list = $('threadList')
  if (!state.threads.length) {
    list.innerHTML = '<li class="muted">No threads yet. Start one with “New thread”.</li>'
    return
  }
  list.innerHTML = state.threads.map((thread) => {
    const unread = thread.messages?.unread || 0
    return `
      <li>
        <button class="thread-item ${thread.id === state.currentThread?.id ? 'selected' : ''}" data-thread="${escapeHtml(thread.id)}" type="button">
          <span class="thread-title">${escapeHtml(thread.subject)}</span>
          <span class="muted">${escapeHtml(thread.inbox?.name || thread.channel?.name || 'Direct')} · ${escapeHtml(thread.status)}</span>
          <span class="muted">${new Date(thread.lastMessageAt).toLocaleString()}${unread ? ` · ${unread} unread` : ''}</span>
        </button>
      </li>`
  }).join('')
  list.querySelectorAll('[data-thread]').forEach((button) => {
    button.onclick = () => selectThread(button.dataset.thread)
  })
}

async function selectThread(threadId) {
  try {
    const { thread } = await request(`/messaging/threads/${encodeURIComponent(threadId)}`)
    state.thread = thread
    state.read.clear()
    $('threadSubject').textContent = thread.subject
    $('threadMeta').textContent = `${thread.inbox?.name || thread.channel?.name || 'Direct thread'} · ${thread.status} · ${thread.classification}`
    $('composer').hidden = false
    $('assignSelect').hidden = !canManage()
    $('assignButton').hidden = !canManage()
    $('resolveButton').hidden = !canManage()
    $('resolveButton').textContent = thread.status === 'RESOLVED' ? 'Reopen' : 'Resolve'
    renderThreads()
    await loadMessages(threadId)
    if (socket?.connected) socket.emit('subscribe:thread', { threadId })
    await flushQueue(threadId)
  } catch (error) {
    $('inboxError').textContent = error.message
  }
}

function renderMessages() {
  const list = $('messageList')
  if (!state.messages.length) {
    list.innerHTML = '<p class="muted">No messages in this thread yet.</p>'
    return
  }
  list.innerHTML = state.messages.map((message) => {
    const own = message.senderId === me?.user?.id
    const online = state.presence.has(message.senderId)
    const reactions = (message.reactions || []).map((reaction) => {
      const mine = reaction.userId === me?.user?.id
      return `<button class="reaction ${mine ? 'mine' : ''}" data-react="${escapeHtml(message.id)}" data-emoji="${escapeHtml(reaction.emoji)}" type="button">${escapeHtml(reaction.emoji)}</button>`
    }).join('')
    const receipts = (message.receipts || []).length
      ? `<span class="muted">${(message.receipts || []).filter((r) => r.readAt).length}/${message.receipts.length} read</span>`
      : ''
    return `
      <article class="message ${message.visibility === 'INTERNAL' ? 'internal' : ''} ${own ? 'own' : ''}" data-message="${escapeHtml(message.id)}">
        <div class="message-head">
          <strong>${escapeHtml(message.senderName)}</strong>
          ${online ? '<span class="presence" title="Online"></span>' : ''}
          ${message.visibility === 'INTERNAL' ? '<span class="badge internal-badge">Internal note</span>' : ''}
          <time class="muted">${new Date(message.createdAt).toLocaleString()}</time>
        </div>
        <div class="message-body">${escapeHtml(message.body).replace(/\n/g, '<br />')}</div>
        <div class="message-foot">
          <button class="reaction" data-react="${escapeHtml(message.id)}" data-emoji="👍" type="button" title="React with 👍">👍</button>
          ${reactions}
          ${own && !message.recalledAt ? `<button class="link" data-recall="${escapeHtml(message.id)}" type="button">Recall</button>` : ''}
          ${receipts}
        </div>
      </article>`
  }).join('')
  list.querySelectorAll('[data-react]').forEach((button) => {
    button.onclick = () => toggleReaction(button.dataset.react, button.dataset.emoji)
  })
  list.querySelectorAll('[data-recall]').forEach((button) => {
    button.onclick = () => recallMessage(button.dataset.recall)
  })
  list.scrollTop = list.scrollHeight
}

async function loadMessages(threadId) {
  try {
    const { messages } = await request(`/messaging/threads/${encodeURIComponent(threadId)}/messages?limit=100`)
    state.messages = messages
    renderMessages()
    for (const message of messages) {
      if (message.senderId === me?.user?.id || state.read.has(message.id)) continue
      state.read.add(message.id)
      request(`/messaging/messages/${encodeURIComponent(message.id)}/read`, { method: 'POST' }).catch(() => {})
    }
  } catch (error) {
    $('inboxError').textContent = error.message
  }
}

async function refreshInbox() {
  if (!token) return
  try {
    const { threads } = await request('/messaging/threads?limit=100')
    state.threads = threads
    renderThreads()
    if (state.thread && threads.some((thread) => thread.id === state.thread.id)) {
      await loadMessages(state.thread.id)
    }
    $('inboxError').textContent = ''
  } catch (error) {
    if (!error.offline) $('inboxError').textContent = error.message
  }
}

// ------------------------------------------------------------ compositions

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] }
}

function writeQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(0, 50)))
}

function queueCount() {
  return readQueue().length
}

async function postMessage(threadId, body, visibility, key) {
  const result = await request(`/messaging/threads/${encodeURIComponent(threadId)}/messages`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({ body, visibility }),
  })
  return result
}

async function sendQueued(entry) {
  await postMessage(entry.threadId, entry.body, entry.visibility, entry.key)
  writeQueue(readQueue().filter((item) => item.key !== entry.key))
}

async function flushQueue(threadId = null) {
  let queue = readQueue()
  if (threadId) queue = queue.filter((entry) => entry.threadId === threadId)
  for (const entry of queue) {
    try {
      await sendQueued(entry)
    } catch (error) {
      if (error.status >= 400 && error.status < 500) {
        writeQueue(readQueue().filter((item) => item.key !== entry.key))
        $('composeStatus').textContent = error.message
      }
      return
    }
  }
  await refreshInbox()
}

$('composer').onsubmit = async (event) => {
  event.preventDefault()
  const body = $('composerBody').value.trim()
  if (!body || !state.thread) return
  const entry = {
    threadId: state.thread.id,
    body,
    visibility: $('internalNote').checked ? 'INTERNAL' : 'RECIPIENT',
    key: idempotencyKey(),
  }
  $('sendButton').disabled = true
  $('composerBody').value = ''
  try {
    await sendQueued(entry)
    $('composeStatus').textContent = `Sent${entry.visibility === 'INTERNAL' ? ' internal note' : ''}`
    await loadMessages(entry.threadId)
  } catch (error) {
    if (error.offline || error.status >= 500) {
      writeQueue([...readQueue(), entry])
      $('composeStatus').textContent = `Queued offline · ${queueCount()} pending`
    } else {
      $('composerBody').value = body
      $('composeStatus').textContent = error.message
    }
  } finally {
    $('sendButton').disabled = false
  }
}

$('composerBody').oninput = () => {
  if (!socket?.connected || !state.thread) return
  socket.emit('typing', { threadId: state.thread.id, isTyping: true })
  clearTimeout(typingTimer)
  typingTimer = setTimeout(() => socket.emit('typing', { threadId: state.thread.id, isTyping: false }), 1500)
}

async function toggleReaction(messageId, emoji) {
  const message = state.messages.find((item) => item.id === messageId)
  const mine = message?.reactions?.some((reaction) => reaction.userId === me?.user?.id && reaction.emoji === emoji)
  try {
    if (mine) {
      await request(`/messaging/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(emoji)}`, { method: 'DELETE' })
    } else {
      await request(`/messaging/messages/${encodeURIComponent(messageId)}/reactions`, {
        method: 'POST', body: JSON.stringify({ emoji }),
      })
    }
    await loadMessages(state.thread.id)
  } catch (error) {
    $('inboxError').textContent = error.message
  }
}

async function recallMessage(messageId) {
  try {
    await request(`/messaging/messages/${encodeURIComponent(messageId)}/recall`, { method: 'POST' })
    await loadMessages(state.thread.id)
  } catch (error) {
    $('inboxError').textContent = error.message
  }
}

$('assignButton').onclick = async () => {
  if (!state.thread) return
  try {
    const assignedToId = $('assignSelect').value || null
    await request(`/messaging/threads/${encodeURIComponent(state.thread.id)}/assign`, {
      method: 'POST', body: JSON.stringify({ assignedToId }),
    })
    await refreshInbox()
    await selectThread(state.thread.id)
  } catch (error) {
    $('inboxError').textContent = error.message
  }
}

$('resolveButton').onclick = async () => {
  if (!state.thread) return
  try {
    await request(`/messaging/threads/${encodeURIComponent(state.thread.id)}/resolve`, { method: 'POST' })
    await refreshInbox()
    await selectThread(state.thread.id)
  } catch (error) {
    $('inboxError').textContent = error.message
  }
}

$('newThreadButton').onclick = () => {
  $('newThreadForm').hidden = !$('newThreadForm').hidden
  if (!$('newThreadForm').hidden) $('newSubject').focus()
}

$('cancelNewThread').onclick = () => {
  $('newThreadForm').hidden = true
  $('newThreadForm').reset()
}

$('newThreadForm').onsubmit = async (event) => {
  event.preventDefault()
  const recipients = $('newRecipients').value.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean)
  try {
    const { thread } = await request('/messaging/threads', {
      method: 'POST',
      body: JSON.stringify({
        subject: $('newSubject').value,
        recipients,
      }),
    })
    await postMessage(thread.id, $('newBody').value, 'RECIPIENT', idempotencyKey())
    $('newThreadForm').hidden = true
    $('newThreadForm').reset()
    await refreshInbox()
    await selectThread(thread.id)
  } catch (error) {
    $('inboxError').textContent = error.message
  }
}

// ---------------------------------------------------------------- realtime

function loadSocketClient() {
  if (window.io) return Promise.resolve(true)
  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = `${REALTIME}/socket.io/socket.io.js`
    script.onload = () => resolve(Boolean(window.io))
    script.onerror = () => resolve(false)
    document.head.appendChild(script)
  })
}

function startPolling(label = 'Polling') {
  setConnection(label)
  if (pollTimer) return
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') refreshInbox()
  }, POLL_MS)
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

function disconnectRealtime() {
  stopPolling()
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
  setConnection('Offline')
}

function onDomainEvent() {
  refreshInbox()
}

function connectRealtime() {
  loadSocketClient().then(async (available) => {
    if (!available || !token) {
      startPolling('Polling')
      return
    }
    let tokenResult
    try {
      tokenResult = await request('/messaging/realtime-token')
    } catch {
      startPolling('Polling')
      return
    }
    socket = window.io(REALTIME, {
      auth: { token: tokenResult.token },
      reconnection: true,
      reconnectionDelay: 2000,
      timeout: 5000,
    })
    socket.on('connect', () => {
      setConnection('Live', true)
      stopPolling()
      if (state.thread) socket.emit('subscribe:thread', { threadId: state.thread.id })
      refreshInbox()
      flushQueue()
    })
    socket.on('connect_error', () => startPolling('Polling'))
    socket.on('disconnect', () => startPolling('Reconnecting'))
    for (const event of ['message:new', 'message:recalled', 'thread:assigned', 'thread:resolved', 'reaction:added']) {
      socket.on(event, onDomainEvent)
    }
    socket.on('presence:update', ({ userId, online } = {}) => {
      if (!userId) return
      if (online) state.presence.add(userId)
      else state.presence.delete(userId)
      renderMessages()
    })
    socket.on('typing:update', ({ threadId, userId, isTyping } = {}) => {
      if (threadId !== state.thread?.id || userId === me?.user?.id) return
      if (isTyping) {
        const user = users.find((item) => item.id === userId)
        state.typing = `${user ? `${user.firstName} ${user.lastName}` : 'Someone'} is typing…`
      } else {
        state.typing = null
      }
      $('typing').textContent = state.typing || ''
    })
  })
}

window.addEventListener('online', () => {
  if (token) flushQueue().then(refreshInbox)
})

// ------------------------------------------------------------------ views

function showView(view) {
  const inbox = view === 'inbox'
  $('inboxView').hidden = !inbox
  $('directoryView').hidden = inbox
  $('tabInbox').classList.toggle('active', inbox)
  $('tabDirectory').classList.toggle('active', !inbox)
}

$('tabInbox').onclick = () => showView('inbox')
$('tabDirectory').onclick = () => showView('directory')

// ------------------------------------------------------------------- boot

async function start() {
  try {
    const profile = await request('/auth/me')
    showDashboard(profile)
    await Promise.all([refreshInbox(), loadDirectory()])
    connectRealtime()
    if (queueCount()) $('composeStatus').textContent = `${queueCount()} queued message(s)`
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
