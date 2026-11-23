// ERP shell: identity, directory, messaging, platform views (notifications,
// files, workflow, search, documents), Phase 6 finance, Phase 7 sales,
// Phase 8 inventory and Phase 9 procurement. Uses the same JSON API as the
// storefront; no external dependencies. The Socket.IO client is served by the
// realtime service itself, and the inbox falls back to authenticated polling
// when sockets are unavailable.

const API = window.ERP_API_URL || 'http://localhost:4000/api'
const API_ORIGIN = API.replace(/\/api\/?$/, '')
const REALTIME = window.ERP_REALTIME_URL || 'http://localhost:4001'
const POLL_MS = 6000
const QUEUE_KEY = 'comet_erp_message_queue'
const VIEWS = ['inbox', 'directory', 'notifications', 'files', 'workflow', 'search', 'documents', 'finance', 'sales', 'inventory', 'procurement']
const FINANCE_EVENTS = [
  'finance:account', 'finance:journal', 'finance:invoice', 'finance:payment',
  'finance:budget', 'finance:rate', 'finance:etims', 'finance:etims-failed',
]
// Sales socket frames carry IDs/classification only. They are invalidation
// signals: content is always refetched over the authenticated API.
const SALES_EVENTS = [
  'sales:quote', 'sales:order', 'sales:delivery', 'sales:return', 'sales:invoice',
]
// Inventory socket frames carry IDs/classification only. They are invalidation
// signals: amounts, quantities and records always come from the authenticated API.
const INVENTORY_EVENTS = [
  'inventory:item', 'inventory:stock', 'inventory:transfer', 'inventory:count', 'inventory:alert',
]
// Procurement socket frames carry IDs/classification only. They are pure
// invalidation signals: documents and amounts always come from the API.
const PROCUREMENT_EVENTS = [
  'procurement:requisition', 'procurement:order', 'procurement:receipt',
  'procurement:return', 'procurement:match',
]
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
  view: 'inbox',
  unread: 0,
  versionTarget: null,
  notifications: [],
  files: [],
  definitions: [],
  instances: [],
  tasks: [],
  searchResults: [],
  searchTotal: 0,
  documents: [],
  documentKinds: [],
  financeAccounts: [],
  financeRates: [],
  financeParties: [],
  financeInvoices: [],
  financePayments: [],
  financeBudgets: [],
  financeSubmissions: [],
  salesQuotes: [],
  salesOrders: [],
  salesDeliveries: [],
  salesReturns: [],
  salesCustomers: [],
  salesRates: [],
  inventoryItems: [],
  inventoryWarehouses: [],
  inventoryBatches: [],
  inventoryBalances: [],
  inventoryMovements: [],
  inventoryTransfers: [],
  inventoryCounts: [],
  inventoryAlerts: [],
  procurementRequisitions: [],
  procurementOrders: [],
  procurementReceipts: [],
  procurementReturns: [],
  procurementMatches: [],
}
let financeRefreshTimer = null
let salesRefreshTimer = null
let inventoryRefreshTimer = null
let procurementRefreshTimer = null

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char])
}

function idempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `key_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function listFrom(payload, ...keys) {
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key]
  }
  return []
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

function formatBytes(value) {
  const bytes = Number(value) || 0
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function setError(id, message) {
  const element = $(id)
  if (element) element.textContent = message || ''
}

function resolveApiUrl(url) {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return `${API_ORIGIN}${String(url).startsWith('/') ? url : `/${url}`}`
}

function handleUnauthorized() {
  if (!token) return
  token = ''
  sessionStorage.removeItem('comet_erp_token')
  disconnectRealtime()
  showLogin('Your session expired. Please sign in again.')
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
  if (response.status === 401 && token && !path.startsWith('/auth/')) handleUnauthorized()
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
  $('unreadBadge').hidden = true
  $('mfaForm').hidden = !mfaChallenge
  $('loginForm').hidden = Boolean(mfaChallenge)
  $('authError').textContent = message
  setConnection('Offline')
}

function showDashboard(profile) {
  me = profile
  $('loginPanel').hidden = true
  $('dashboard').hidden = false
  setUnreadBadge(state.unread)
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
    state.notifications = []
    state.files = []
    state.definitions = []
    state.instances = []
    state.tasks = []
    state.documents = []
    state.financeAccounts = []
    state.financeRates = []
    state.financeParties = []
    state.financeInvoices = []
    state.financePayments = []
    state.financeBudgets = []
    state.financeSubmissions = []
    state.salesQuotes = []
    state.salesOrders = []
    state.salesDeliveries = []
    state.salesReturns = []
    state.salesCustomers = []
    state.salesRates = []
    state.inventoryItems = []
    state.inventoryWarehouses = []
    state.inventoryBatches = []
    state.inventoryBalances = []
    state.inventoryMovements = []
    state.inventoryTransfers = []
    state.inventoryCounts = []
    state.inventoryAlerts = []
    state.versionTarget = null
    setUnreadBadge(0)
    $('versionPanel').hidden = true
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

// ---------------------------------------------------------- notifications

function setUnreadBadge(count) {
  state.unread = Math.max(0, Number(count) || 0)
  const badge = $('unreadBadge')
  badge.textContent = String(state.unread)
  badge.hidden = false
}

async function refreshUnreadBadge() {
  if (!token) {
    state.unread = 0
    $('unreadBadge').hidden = true
    return
  }
  try {
    const result = await request('/notifications?unreadOnly=true&limit=200')
    setUnreadBadge(listFrom(result, 'items', 'notifications').length)
  } catch {
    // Keep the last known count if the user cannot read notifications.
  }
}

function renderNotifications() {
  const body = $('notificationRows')
  if (!state.notifications.length) {
    body.innerHTML = `<tr><td colspan="5" class="muted">${$('notificationUnreadOnly').checked ? 'No unread notifications.' : 'No notifications yet.'}</td></tr>`
    return
  }
  body.innerHTML = state.notifications.map((item) => `
    <tr>
      <td><strong>${escapeHtml(item.title)}</strong><br /><span class="muted">${escapeHtml(item.message)}</span></td>
      <td>${escapeHtml(item.category)}</td>
      <td>${escapeHtml(formatDate(item.createdAt))}</td>
      <td>${item.readAt ? '<span class="pill">Read</span>' : '<span class="pill unread-badge">Unread</span>'}</td>
      <td>${item.readAt ? '' : `<button class="secondary" data-notification-read="${escapeHtml(item.id)}" type="button">Mark read</button>`}</td>
    </tr>`).join('')
  body.querySelectorAll('[data-notification-read]').forEach((button) => {
    button.onclick = () => markNotificationRead(button.dataset.notificationRead)
  })
}

async function refreshNotifications() {
  if (!token) return
  try {
    const unreadOnly = $('notificationUnreadOnly').checked ? 'true' : 'false'
    const result = await request(`/notifications?unreadOnly=${unreadOnly}&limit=50`)
    state.notifications = listFrom(result, 'items', 'notifications')
    renderNotifications()
    setError('notificationsError', '')
  } catch (error) {
    setError('notificationsError', error.message)
  }
}

async function markNotificationRead(id) {
  try {
    await request(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' })
    await Promise.all([refreshNotifications(), refreshUnreadBadge()])
  } catch (error) {
    setError('notificationsError', error.message)
  }
}

async function loadPreferences() {
  if (!token) return
  try {
    const { preferences } = await request('/notifications/preferences')
    $('prefEnabled').checked = Boolean(preferences.enabled)
    $('prefDigest').value = String(preferences.digestMinutes ?? 0)
    $('preferencesStatus').textContent = ''
  } catch (error) {
    $('preferencesStatus').textContent = error.message
  }
}

$('unreadBadge').onclick = () => showView('notifications')
$('notificationUnreadOnly').onchange = () => refreshNotifications()
$('markAllRead').onclick = async () => {
  try {
    await request('/notifications/read-all', { method: 'POST' })
    await Promise.all([refreshNotifications(), refreshUnreadBadge()])
  } catch (error) {
    setError('notificationsError', error.message)
  }
}
$('preferencesForm').onsubmit = async (event) => {
  event.preventDefault()
  $('preferencesStatus').textContent = 'Saving…'
  try {
    const { preferences } = await request('/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify({
        channel: 'IN_APP',
        enabled: $('prefEnabled').checked,
        digestMinutes: Number($('prefDigest').value) || 0,
      }),
    })
    $('preferencesStatus').textContent = `Saved${preferences.enabled ? '' : ' (disabled)'}`
  } catch (error) {
    $('preferencesStatus').textContent = error.message
  }
}

// -------------------------------------------------------------------- files

function renderFiles() {
  const body = $('fileRows')
  if (!state.files.length) {
    body.innerHTML = '<tr><td colspan="7" class="muted">No files yet.</td></tr>'
    return
  }
  body.innerHTML = state.files.map((file) => `
    <tr>
      <td><strong>${escapeHtml(file.name)}</strong><br /><span class="muted">${escapeHtml(file.purpose)}</span></td>
      <td>${escapeHtml(formatBytes(file.size))}</td>
      <td>${escapeHtml(file.status)}</td>
      <td>v${escapeHtml(file.version ?? 1)}</td>
      <td>${escapeHtml(file.classification)}</td>
      <td>${escapeHtml(formatDate(file.updatedAt || file.createdAt))}</td>
      <td class="actions-cell">
        <button class="link" data-file-download="${escapeHtml(file.id)}" data-name="${escapeHtml(file.name)}" type="button">Download</button>
        <button class="link" data-file-version="${escapeHtml(file.id)}" data-name="${escapeHtml(file.name)}" type="button">New version</button>
        <button class="link danger" data-file-delete="${escapeHtml(file.id)}" type="button">Delete</button>
      </td>
    </tr>`).join('')
  body.querySelectorAll('[data-file-download]').forEach((button) => {
    button.onclick = () => downloadFile(button.dataset.fileDownload, button.dataset.name)
  })
  body.querySelectorAll('[data-file-version]').forEach((button) => {
    button.onclick = () => startVersion(button.dataset.fileVersion, button.dataset.name)
  })
  body.querySelectorAll('[data-file-delete]').forEach((button) => {
    button.onclick = () => deleteFile(button.dataset.fileDelete)
  })
}

async function refreshFiles() {
  if (!token) return
  try {
    const result = await request('/files?limit=50')
    // Some deployments return { files }, others { items }; accept either.
    state.files = listFrom(result, 'files', 'items')
    renderFiles()
    setError('filesError', '')
  } catch (error) {
    setError('filesError', error.message)
  }
}

async function fileChecksum(file) {
  if (!globalThis.crypto?.subtle || !file.arrayBuffer) return ''
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
  } catch {
    return ''
  }
}

async function uploadSelectedFile(file, versionId = null) {
  if (!file) return
  const statusEl = versionId ? $('versionStatus') : $('uploadStatus')
  $('uploadButton').disabled = true
  try {
    statusEl.textContent = 'Preparing…'
    const checksum = await fileChecksum(file)
    const body = {
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      classification: $('uploadClassification').value,
      purpose: $('uploadPurpose').value,
      folder: $('uploadFolder').value.trim(),
      checksum,
    }
    statusEl.textContent = 'Requesting signed upload…'
    const result = versionId
      ? await request(`/files/${encodeURIComponent(versionId)}/versions`, { method: 'POST', body: JSON.stringify(body) })
      : await request('/files/uploads', { method: 'POST', body: JSON.stringify(body) })
    const record = result.file || {}
    const upload = result.upload || {}
    const method = String(upload.method || (upload.provider === 'R2' ? 'PUT' : 'POST')).toUpperCase()
    const headers = { ...(upload.headers || {}) }
    if (upload.provider === 'LOCAL' && token) headers.Authorization = `Bearer ${token}`
    statusEl.textContent = 'Uploading…'
    const response = await fetch(resolveApiUrl(upload.url), {
      method,
      headers,
      body: file,
      credentials: upload.provider === 'LOCAL' ? 'include' : 'omit',
    })
    if (response.status === 401 && token) {
      handleUnauthorized()
      throw new Error('Session expired. Please sign in again.')
    }
    if (!response.ok) throw new Error(`Upload failed (${response.status})`)
    statusEl.textContent = 'Confirming…'
    await request(`/files/uploads/${encodeURIComponent(record.id)}/confirm`, {
      method: 'POST', body: JSON.stringify({ checksum }),
    })
    statusEl.textContent = `Uploaded ${file.name}`
    if (versionId) $('versionFile').value = ''
    else $('uploadFile').value = ''
    await refreshFiles()
  } catch (error) {
    statusEl.textContent = error.message
  } finally {
    $('uploadButton').disabled = false
  }
}

function startVersion(fileId, name) {
  state.versionTarget = fileId
  $('versionPanel').hidden = false
  $('versionLabel').textContent = `New version for ${name}`
  $('versionFile').value = ''
  $('versionStatus').textContent = ''
  $('versionFile').click()
}

async function deleteFile(fileId) {
  if (!window.confirm('Delete this file and all of its versions?')) return
  try {
    await request(`/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' })
    await refreshFiles()
  } catch (error) {
    setError('filesError', error.message)
  }
}

async function openDownload(download, fallbackUrl, suggestedName) {
  const info = download || {}
  const url = resolveApiUrl(info.url || fallbackUrl)
  if (!url) throw new Error('No download URL was returned')
  const isAbsolute = /^https?:\/\//i.test(url)
  if (isAbsolute && !url.startsWith(API_ORIGIN)) {
    // R2 presigned URLs are public for their short lifetime.
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  // Local signed URLs still require the bearer token, so fetch and save a blob.
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  })
  if (response.status === 401 && token) {
    handleUnauthorized()
    throw new Error('Session expired. Please sign in again.')
  }
  if (!response.ok) throw new Error(`Download failed (${response.status})`)
  const objectUrl = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = suggestedName || info.fileName || 'download'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

async function downloadFile(fileId, name) {
  try {
    const result = await request(`/files/${encodeURIComponent(fileId)}/download`)
    await openDownload(result.download || result, result.url, name)
  } catch (error) {
    setError('filesError', error.message)
  }
}

$('fileUploadForm').onsubmit = async (event) => {
  event.preventDefault()
  await uploadSelectedFile($('uploadFile').files[0])
}
$('versionFile').onchange = () => uploadSelectedFile($('versionFile').files[0], state.versionTarget)
$('cancelVersion').onclick = () => {
  state.versionTarget = null
  $('versionPanel').hidden = true
  $('versionFile').value = ''
  $('versionStatus').textContent = ''
}
$('refreshFiles').onclick = () => refreshFiles()

// ----------------------------------------------------------------- workflow

function renderDefinitions() {
  const body = $('definitionRows')
  $('definitionCount').textContent = `${state.definitions.length} definitions`
  body.innerHTML = state.definitions.length
    ? state.definitions.map((definition) => `
      <tr>
        <td><code>${escapeHtml(definition.code)}</code></td>
        <td>${escapeHtml(definition.name)}<br /><span class="muted">${escapeHtml(definition.description)}</span></td>
        <td>${escapeHtml((definition.steps || []).length)}</td>
        <td>${escapeHtml(definition.classification)}</td>
        <td>${definition.active ? 'Active' : 'Inactive'}</td>
        <td>v${escapeHtml(definition.version ?? 1)}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="muted">No workflow definitions yet.</td></tr>'
}

function renderInstances() {
  const body = $('instanceRows')
  $('instanceCount').textContent = `${state.instances.length} instances`
  body.innerHTML = state.instances.length
    ? state.instances.map((instance) => `
      <tr>
        <td>${escapeHtml(instance.definition?.name || instance.definition?.code || instance.definitionId)}</td>
        <td>${escapeHtml(instance.entityType)} ${escapeHtml(instance.entityId || '')}</td>
        <td>${escapeHtml(instance.status)}</td>
        <td>${escapeHtml(instance.currentStep || '—')}</td>
        <td>${escapeHtml(formatDate(instance.createdAt))}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="muted">No workflow instances yet.</td></tr>'
}

function rowValue(taskId, attribute) {
  const element = $('taskRows').querySelector(`[${attribute}="${taskId}"]`)
  return element ? element.value.trim() : ''
}

function renderTasks() {
  const body = $('taskRows')
  $('taskCount').textContent = `${state.tasks.length} tasks`
  if (!state.tasks.length) {
    body.innerHTML = '<tr><td colspan="6" class="muted">No tasks assigned to you.</td></tr>'
    return
  }
  const options = users.length
    ? users.map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.firstName)} ${escapeHtml(user.lastName)}</option>`).join('')
    : '<option value="">No users available</option>'
  body.innerHTML = state.tasks.map((task) => {
    const instance = task.instance || {}
    const definition = instance.definition || {}
    const actionable = task.status === 'PENDING'
    return `
      <tr>
        <td><strong>${escapeHtml(task.title || task.stepKey)}</strong><br /><span class="muted">${escapeHtml(task.stepKey)}</span></td>
        <td>${escapeHtml(definition.name || instance.entityType || task.instanceId)}<br /><span class="muted">${escapeHtml(instance.entityType || '')} ${escapeHtml(instance.entityId || '')}</span></td>
        <td>${escapeHtml(task.status)}${task.decision ? ` · ${escapeHtml(task.decision)}` : ''}</td>
        <td><input class="row-input" data-comment="${escapeHtml(task.id)}" placeholder="Optional comment" maxlength="1000" /></td>
        <td><select class="row-select" data-delegate="${escapeHtml(task.id)}">${options}</select></td>
        <td class="actions-cell">${actionable
          ? `<button class="secondary" data-decide="${escapeHtml(task.id)}" data-decision="APPROVED" type="button">Approve</button>
             <button class="secondary" data-decide="${escapeHtml(task.id)}" data-decision="REJECTED" type="button">Reject</button>
             <button class="link" data-delegate-submit="${escapeHtml(task.id)}" type="button">Delegate</button>`
          : '<span class="muted">Actioned</span>'}</td>
      </tr>`
  }).join('')
  body.querySelectorAll('[data-decide]').forEach((button) => {
    button.onclick = () => decideTask(button.dataset.decide, button.dataset.decision)
  })
  body.querySelectorAll('[data-delegate-submit]').forEach((button) => {
    button.onclick = () => delegateTask(button.dataset.delegateSubmit)
  })
}

async function refreshDefinitions() {
  if (!token) return
  try {
    const result = await request('/workflow/definitions')
    state.definitions = listFrom(result, 'definitions', 'items')
    renderDefinitions()
  } catch (error) {
    setError('workflowError', error.message)
  }
}

async function refreshInstances() {
  if (!token) return
  try {
    const result = await request('/workflow/instances?limit=50')
    state.instances = listFrom(result, 'instances', 'items')
    renderInstances()
  } catch (error) {
    setError('workflowError', error.message)
  }
}

async function refreshTasks() {
  if (!token) return
  try {
    if (!users.length) {
      try {
        const result = await request('/identity/users')
        users = result.users || []
        renderAssignOptions()
      } catch {
        // Delegate dropdown may stay empty when directory access is denied.
      }
    }
    const result = await request('/workflow/tasks?mine=1&limit=50')
    state.tasks = listFrom(result, 'tasks', 'items')
    renderTasks()
    setError('workflowError', '')
  } catch (error) {
    setError('workflowError', error.message)
  }
}

async function refreshWorkflow() {
  await Promise.all([refreshDefinitions(), refreshInstances(), refreshTasks()])
}

async function decideTask(taskId, decision) {
  try {
    await request(`/workflow/tasks/${encodeURIComponent(taskId)}/decide`, {
      method: 'POST',
      body: JSON.stringify({ decision, comment: rowValue(taskId, 'data-comment') }),
    })
    await Promise.all([refreshTasks(), refreshInstances()])
  } catch (error) {
    setError('workflowError', error.message)
  }
}

async function delegateTask(taskId) {
  const toUserId = rowValue(taskId, 'data-delegate')
  if (!toUserId) {
    setError('workflowError', 'Choose a user to delegate to.')
    return
  }
  try {
    await request(`/workflow/tasks/${encodeURIComponent(taskId)}/delegate`, {
      method: 'POST',
      body: JSON.stringify({ toUserId, comment: rowValue(taskId, 'data-comment') }),
    })
    await Promise.all([refreshTasks(), refreshInstances()])
  } catch (error) {
    setError('workflowError', error.message)
  }
}

$('definitionForm').onsubmit = async (event) => {
  event.preventDefault()
  let steps
  try {
    steps = JSON.parse($('definitionSteps').value)
  } catch {
    setError('workflowError', 'Steps must be a valid JSON array.')
    return
  }
  if (!Array.isArray(steps)) {
    setError('workflowError', 'Steps must be a valid JSON array.')
    return
  }
  try {
    await request('/workflow/definitions', {
      method: 'POST',
      body: JSON.stringify({
        code: $('definitionCode').value.trim(),
        name: $('definitionName').value.trim(),
        description: $('definitionDescription').value.trim(),
        steps,
        classification: $('definitionClassification').value,
        active: $('definitionActive').checked,
      }),
    })
    $('definitionForm').reset()
    await refreshDefinitions()
    setError('workflowError', '')
  } catch (error) {
    setError('workflowError', error.message)
  }
}

$('instanceForm').onsubmit = async (event) => {
  event.preventDefault()
  let context = {}
  try {
    context = JSON.parse($('instanceContext').value || '{}')
  } catch {
    setError('workflowError', 'Context must be a valid JSON object.')
    return
  }
  try {
    await request('/workflow/instances', {
      method: 'POST',
      body: JSON.stringify({
        definitionCode: $('instanceDefinition').value.trim(),
        entityType: $('instanceEntityType').value.trim(),
        entityId: $('instanceEntityId').value.trim(),
        branchId: $('instanceBranchId').value.trim() || null,
        context,
      }),
    })
    await Promise.all([refreshInstances(), refreshTasks()])
    setError('workflowError', '')
  } catch (error) {
    setError('workflowError', error.message)
  }
}

// ------------------------------------------------------------------- search

function renderSearch() {
  const body = $('searchRows')
  $('searchCount').textContent = `${state.searchTotal} result${state.searchTotal === 1 ? '' : 's'}`
  body.innerHTML = state.searchResults.length
    ? state.searchResults.map((item) => `
      <tr>
        <td>${escapeHtml(item.entityType)}</td>
        <td><strong>${escapeHtml(item.title)}</strong></td>
        <td><span class="muted">${escapeHtml(item.summary)}</span></td>
        <td>${escapeHtml(item.classification)}</td>
        <td>${escapeHtml(formatDate(item.updatedAt))}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="muted">Enter a search term to find records.</td></tr>'
}

async function refreshSearch() {
  if (!token) return
  const query = $('searchQuery').value.trim()
  if (!query) {
    state.searchResults = []
    state.searchTotal = 0
    renderSearch()
    return
  }
  const types = [...document.querySelectorAll('[data-search-type]:checked')].map((input) => input.value)
  const params = new URLSearchParams({ q: query, limit: '30' })
  if (types.length) params.set('types', types.join(','))
  try {
    const result = await request(`/search?${params}`)
    state.searchResults = listFrom(result, 'items')
    state.searchTotal = Number(result.total ?? state.searchResults.length)
    renderSearch()
    setError('searchError', '')
  } catch (error) {
    setError('searchError', error.message)
  }
}

$('searchForm').onsubmit = (event) => {
  event.preventDefault()
  refreshSearch()
}

// ---------------------------------------------------------------- documents

function renderDocuments() {
  const body = $('documentRows')
  body.innerHTML = state.documents.length
    ? state.documents.map((doc) => `
      <tr>
        <td><code>${escapeHtml(doc.number)}</code></td>
        <td>${escapeHtml(doc.kind)}</td>
        <td>${escapeHtml(doc.title)}</td>
        <td>${escapeHtml(doc.status)}</td>
        <td>${escapeHtml(doc.clientCompany || doc.clientName)}</td>
        <td>${escapeHtml(doc.total ?? 0)}</td>
        <td class="actions-cell"><button class="link" data-document-download="${escapeHtml(doc.number)}" type="button">Download</button></td>
      </tr>`).join('')
    : '<tr><td colspan="7" class="muted">No documents yet.</td></tr>'
  body.querySelectorAll('[data-document-download]').forEach((button) => {
    button.onclick = () => downloadDocument(button.dataset.documentDownload)
  })
}

async function refreshDocuments() {
  if (!token) return
  try {
    const result = await request('/documents?all=1')
    state.documents = listFrom(result, 'items', 'documents')
    renderDocuments()
    setError('documentsError', '')
  } catch (error) {
    setError('documentsError', error.message)
  }
}

async function loadDocumentKinds() {
  if (state.documentKinds.length) return
  try {
    const { kinds } = await request('/documents/kinds')
    state.documentKinds = kinds || []
    $('generateKind').innerHTML = state.documentKinds.map((kind) =>
      `<option value="${escapeHtml(kind.kind)}">${escapeHtml(kind.label || kind.kind)}</option>`).join('')
  } catch (error) {
    setError('documentsError', error.message)
  }
}

async function downloadDocument(code) {
  try {
    const result = await request(`/documents/${encodeURIComponent(code)}/download`)
    await openDownload(result.download || result, result.url, result.fileName || `${code}.pdf`)
  } catch (error) {
    setError('documentsError', error.message)
  }
}

async function checkJob(jobId) {
  if (!jobId) return
  try {
    const { job } = await request(`/documents/jobs/${encodeURIComponent(jobId)}`)
    $('jobStatus').textContent = `Status: ${job?.status || 'UNKNOWN'}${job?.failedReason ? ` · ${job.failedReason}` : ''}`
  } catch (error) {
    $('jobStatus').textContent = error.message
  }
}

function collectItems() {
  return [...$('itemRows').querySelectorAll('.item-row')].map((row) => {
    const values = {}
    row.querySelectorAll('[data-item]').forEach((input) => { values[input.dataset.item] = input.value.trim() })
    if (!values.description) return null
    return {
      description: values.description,
      qty: Number(values.qty) || 0,
      unitPrice: Number(values.unitPrice) || 0,
    }
  }).filter(Boolean)
}

function createItemRow() {
  const row = document.createElement('div')
  row.className = 'item-row'
  row.innerHTML = `
    <input data-item="description" placeholder="Description" maxlength="240" />
    <input data-item="qty" type="number" min="0" step="1" placeholder="Qty" />
    <input data-item="unitPrice" type="number" min="0" step="0.01" placeholder="Unit price" />
    <button class="secondary remove-item" type="button" title="Remove item">×</button>`
  return row
}

$('addItem').onclick = () => $('itemRows').appendChild(createItemRow())
$('itemRows').onclick = (event) => {
  const button = event.target.closest('.remove-item')
  if (!button) return
  const row = button.closest('.item-row')
  const rows = $('itemRows').querySelectorAll('.item-row')
  if (rows.length > 1) row.remove()
  else row.querySelectorAll('input').forEach((input) => { input.value = '' })
}
$('refreshDocuments').onclick = () => refreshDocuments()
$('jobForm').onsubmit = (event) => {
  event.preventDefault()
  checkJob($('jobIdInput').value.trim())
}
$('generateForm').onsubmit = async (event) => {
  event.preventDefault()
  const payload = {
    kind: $('generateKind').value,
    title: $('generateTitle').value.trim(),
    clientName: $('generateClientName').value.trim(),
    clientCompany: $('generateClientCompany').value.trim(),
    clientEmail: $('generateClientEmail').value.trim(),
    clientPhone: $('generateClientPhone').value.trim(),
    issueDate: $('generateIssueDate').value,
    dueDate: $('generateDueDate').value,
    validUntil: $('generateValidUntil').value,
    notes: $('generateNotes').value.trim(),
    items: collectItems(),
  }
  $('generateButton').disabled = true
  $('generateStatus').textContent = 'Queueing…'
  try {
    const result = await request('/documents/generate', { method: 'POST', body: JSON.stringify(payload) })
    $('generateStatus').textContent = `Queued · ${result.jobId || 'unknown job'}`
    if (result.jobId) {
      $('jobIdInput').value = result.jobId
      await checkJob(result.jobId)
    }
    await refreshDocuments()
  } catch (error) {
    $('generateStatus').textContent = error.message
  } finally {
    $('generateButton').disabled = false
  }
}

// ------------------------------------------------------------------- finance

function financeList(payload, ...keys) {
  if (Array.isArray(payload)) return payload
  return listFrom(payload, ...keys, 'items')
}

function formatCents(cents, currency) {
  const amount = Number(cents) || 0
  return `${currency ? `${currency} ` : ''}${amount.toFixed(2)}`
}

function financeStatus(status) {
  const value = String(status ?? '—')
  const key = value.toLowerCase().replace(/[^a-z]/g, '')
  const known = [
    'unverified', 'verified', 'superseded', 'draft', 'posted', 'reversed',
    'pending', 'queued', 'submitted', 'failed', 'issued', 'partiallypaid',
    'paid', 'overdue', 'cancelled', 'completed', 'approved', 'closed',
    'submitted', 'sent', 'received', 'inspected', 'rejected', 'returned',
    'flagged', 'matched', 'discrepancy', 'partiallyreceived', 'void',
  ]
  const className = known.includes(key) ? key : ''
  return `<span class="pill finance-status ${className}">${escapeHtml(value)}</span>`
}

function renderFinanceRows(bodyId, rows, columns, emptyMessage) {
  const body = $(bodyId)
  if (!body) return
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="${columns.length}" class="muted">${escapeHtml(emptyMessage)}</td></tr>`
    return
  }
  body.innerHTML = rows
    .map((row) => `<tr>${columns.map((column) => column(row)).join('')}</tr>`)
    .join('')
}

function fillFinanceSelect(select, entries, placeholder) {
  if (!select) return
  const previous = select.value
  const options = entries.map(({ value, label }) =>
    `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('')
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${options}`
  if (previous && [...select.options].some((option) => option.value === previous)) select.value = previous
}

function renderAccounts() {
  renderFinanceRows('accountRows', state.financeAccounts, [
    (account) => `<code>${escapeHtml(account.code)}</code>`,
    (account) => escapeHtml(account.name),
    (account) => escapeHtml(account.type),
    (account) => escapeHtml(account.systemCode || '—'),
    (account) => (account.isActive ? 'Active' : 'Inactive'),
  ], 'No accounts available for this tenant.')
  fillFinanceSelect($('budgetAccount'), state.financeAccounts.map((account) => ({
    value: account.id,
    label: `${account.code} — ${account.name}`,
  })), 'Select an account')
}

function renderRates() {
  renderFinanceRows('rateRows', state.financeRates, [
    (rate) => `<code>${escapeHtml(rate.code)}</code>`,
    (rate) => escapeHtml(rate.label),
    (rate) => escapeHtml(rate.rateBps ?? '—'),
    (rate) => financeStatus(rate.status),
    (rate) => escapeHtml(rate.effectiveFrom),
    (rate) => escapeHtml(rate.sourceReference),
  ], 'No statutory rates available. Verify fixture rates before use.')
  const verifyEntries = state.financeRates
    .filter((rate) => rate.status !== 'VERIFIED')
    .map((rate) => ({
      value: rate.id,
      label: `${rate.code} — ${rate.label} (${rate.rateBps} bps, ${rate.status})`,
    }))
  const usableEntries = state.financeRates
    .filter((rate) => rate.status === 'VERIFIED')
    .map((rate) => ({
      value: rate.id,
      label: `${rate.code} — ${rate.label} (${rate.rateBps} bps, verified)`,
    }))
  fillFinanceSelect($('rateVerifyId'), verifyEntries, 'Select a rate to verify')
  fillFinanceSelect($('invoiceTaxRateId'), usableEntries, 'No rate selected')
}

function partyLabel(id) {
  const party = state.financeParties.find((item) => item.id === id)
  return party ? `${party.name} (${party.type})` : (id || '—')
}

function renderParties() {
  renderFinanceRows('partyRows', state.financeParties, [
    (party) => escapeHtml(party.type),
    (party) => escapeHtml(party.name),
    (party) => escapeHtml(party.taxPinMasked || 'Not supplied'),
    (party) => escapeHtml(party.email || '—'),
    (party) => escapeHtml(party.phone || '—'),
    (party) => escapeHtml(party.currency || '—'),
  ], 'No parties yet.')
  const entries = state.financeParties.map((party) => ({ value: party.id, label: partyLabel(party.id) }))
  fillFinanceSelect($('invoiceParty'), entries, 'Select a party')
  fillFinanceSelect($('paymentParty'), entries, 'Select a party')
}

function renderInvoices() {
  const body = $('invoiceRows')
  renderFinanceRows('invoiceRows', state.financeInvoices, [
    (invoice) => `<code>${escapeHtml(invoice.number)}</code>`,
    (invoice) => escapeHtml(invoice.direction),
    (invoice) => escapeHtml(invoice.type),
    (invoice) => financeStatus(invoice.status),
    (invoice) => escapeHtml(partyLabel(invoice.partyId)),
    (invoice) => escapeHtml(invoice.issueDate),
    (invoice) => escapeHtml(invoice.dueDate || '—'),
    (invoice) => escapeHtml(formatCents(invoice.totalCents, invoice.currency)),
    (invoice) => escapeHtml(formatCents(invoice.balanceCents, invoice.currency)),
    (invoice) => escapeHtml(invoice.classification || '—'),
    (invoice) => (invoice.status === 'DRAFT'
      ? `<button class="secondary" data-issue-invoice="${escapeHtml(invoice.id)}" type="button">Issue</button>`
      : '<span class="muted">—</span>'),
  ], 'No invoices yet.')
  body.querySelectorAll('[data-issue-invoice]').forEach((button) => {
    button.onclick = () => issueInvoice(button.dataset.issueInvoice)
  })
  fillFinanceSelect($('paymentInvoiceId'), state.financeInvoices.map((invoice) => ({
    value: invoice.id,
    label: `${invoice.number} — ${formatCents(invoice.balanceCents, invoice.currency)} due`,
  })), 'No invoice allocation')
}

function renderPayments() {
  renderFinanceRows('paymentRows', state.financePayments, [
    (payment) => `<code>${escapeHtml(payment.number)}</code>`,
    (payment) => escapeHtml(payment.direction),
    (payment) => escapeHtml(partyLabel(payment.partyId)),
    (payment) => escapeHtml(payment.method),
    (payment) => escapeHtml(formatCents(payment.amountCents, payment.currency)),
    (payment) => escapeHtml(payment.paidAt ? formatDate(payment.paidAt) : '—'),
    (payment) => escapeHtml(payment.reference || '—'),
    (payment) => financeStatus(payment.status),
  ], 'No payments recorded yet.')
}

function renderBudgets() {
  const body = $('budgetRows')
  renderFinanceRows('budgetRows', state.financeBudgets, [
    (budget) => `<code>${escapeHtml(budget.code)}</code>`,
    (budget) => escapeHtml(budget.name),
    (budget) => escapeHtml(budget.period),
    (budget) => escapeHtml(budget.startDate),
    (budget) => escapeHtml(budget.endDate),
    (budget) => financeStatus(budget.status),
    (budget) => (budget.status === 'DRAFT'
      ? `<button class="secondary" data-approve-budget="${escapeHtml(budget.id)}" type="button">Approve</button>`
      : '<span class="muted">—</span>'),
  ], 'No budgets yet.')
  body.querySelectorAll('[data-approve-budget]').forEach((button) => {
    button.onclick = () => approveBudget(button.dataset.approveBudget)
  })
}

function renderSubmissions() {
  const body = $('submissionRows')
  renderFinanceRows('submissionRows', state.financeSubmissions, [
    (submission) => escapeHtml(submission.invoiceId),
    (submission) => financeStatus(submission.status),
    (submission) => escapeHtml(submission.payloadVersion),
    (submission) => escapeHtml(submission.provider || '—'),
    (submission) => escapeHtml(submission.attempts ?? 0),
    (submission) => escapeHtml(submission.lastError || '—'),
    (submission) => escapeHtml(formatDate(submission.queuedAt)),
    (submission) => `<button class="link" data-etims-payload="${escapeHtml(submission.id)}" type="button">Payload</button>
      <button class="secondary" data-etims-retry="${escapeHtml(submission.id)}" type="button">Retry</button>`,
  ], 'No eTIMS queue entries yet. Internal queue only — no live KRA filing.')
  body.querySelectorAll('[data-etims-payload]').forEach((button) => {
    button.onclick = () => showEtimsPayload(button.dataset.etimsPayload)
  })
  body.querySelectorAll('[data-etims-retry]').forEach((button) => {
    button.onclick = () => retryEtimsSubmission(button.dataset.etimsRetry)
  })
}

async function loadFinance() {
  if (!token) return
  setError('financeError', '')
  const [accounts, rates, parties, invoices, payments, budgets, submissions] = await Promise.allSettled([
    request('/finance/accounts?limit=200'),
    request('/finance/statutory-rates?limit=200'),
    request('/finance/parties?limit=200'),
    request('/finance/invoices?limit=200'),
    request('/finance/payments?limit=200'),
    request('/finance/budgets'),
    request('/finance/etims/submissions?limit=200'),
  ])
  const failures = []
  const assign = (result, key, setter, keyNames) => {
    if (result.status === 'fulfilled') setter(financeList(result.value, ...keyNames))
    else failures.push(`${key}: ${result.reason?.message || 'unavailable'}`)
  }
  assign(accounts, 'Accounts', (value) => { state.financeAccounts = value }, ['accounts'])
  assign(rates, 'Rates', (value) => { state.financeRates = value }, ['rates'])
  assign(parties, 'Parties', (value) => { state.financeParties = value }, ['parties'])
  assign(invoices, 'Invoices', (value) => { state.financeInvoices = value }, ['invoices'])
  assign(payments, 'Payments', (value) => { state.financePayments = value }, ['payments'])
  assign(budgets, 'Budgets', (value) => { state.financeBudgets = value }, ['budgets'])
  assign(submissions, 'eTIMS', (value) => { state.financeSubmissions = value }, ['submissions'])

  renderAccounts()
  renderRates()
  renderParties()
  renderInvoices()
  renderPayments()
  renderBudgets()
  renderSubmissions()
  if (failures.length) setError('financeError', failures.join(' · '))
}

async function issueInvoice(id) {
  const invoice = state.financeInvoices.find((item) => item.id === id)
  const rateId = invoice?.taxRateId || $('invoiceTaxRateId').value
  const body = rateId ? { taxRateId: rateId } : {}
  setError('invoiceError', '')
  $('invoiceStatus').textContent = `Issuing ${invoice?.number || id}…`
  try {
    await request(`/finance/invoices/${encodeURIComponent(id)}/issue`, {
      method: 'POST', body: JSON.stringify(body),
    })
    $('invoiceStatus').textContent = 'Invoice issued'
    await loadFinance()
  } catch (error) {
    $('invoiceStatus').textContent = ''
    setError('invoiceError', error.status === 409 ? `Issue blocked: ${error.message}` : error.message)
  }
}

async function approveBudget(id) {
  setError('financeError', '')
  $('budgetStatus').textContent = 'Approving…'
  try {
    await request(`/finance/budgets/${encodeURIComponent(id)}/approve`, {
      method: 'POST', body: JSON.stringify({}),
    })
    $('budgetStatus').textContent = 'Budget approved'
    await loadFinance()
  } catch (error) {
    $('budgetStatus').textContent = ''
    setError('financeError', error.message)
  }
}

async function showEtimsPayload(id) {
  try {
    const result = await request(`/finance/etims/submissions/${encodeURIComponent(id)}`)
    const submission = result.submission || result
    $('etimsPayloadLabel').textContent = `Payload for submission ${submission?.id || id} (encrypted PIN references only)`
    $('etimsPayload').textContent = JSON.stringify(submission?.payload ?? {}, null, 2)
    $('etimsPayloadLabel').hidden = false
    $('etimsPayload').hidden = false
    setError('financeError', '')
  } catch (error) {
    setError('financeError', error.message)
  }
}

async function retryEtimsSubmission(id) {
  setError('financeError', '')
  try {
    await request(`/finance/etims/submissions/${encodeURIComponent(id)}/retry`, {
      method: 'POST', body: JSON.stringify({}),
    })
    await loadFinance()
  } catch (error) {
    setError('financeError', error.message)
  }
}

function renderStatement(report) {
  const columns = Array.isArray(report?.columns) ? report.columns : []
  const rows = Array.isArray(report?.rows) ? report.rows : []
  $('statementHead').innerHTML = columns.length
    ? `<tr>${columns.map((column) => `<th>${escapeHtml(column.label ?? column.key)}</th>`).join('')}</tr>`
    : ''
  $('statementRows').innerHTML = rows.length
    ? rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row?.[column.key] ?? '—')}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${Math.max(columns.length, 1)}" class="muted">No rows returned.</td></tr>`
  const totals = report?.totals || {}
  $('statementTotals').innerHTML = columns.length
    ? `<tr>${columns.map((column) => `<th>${escapeHtml(totals[column.key] ?? '')}</th>`).join('')}</tr>`
    : ''
  $('statementStatus').textContent = `${report?.title ? `${report.title} · ` : ''}${rows.length} row(s)`
}

async function runStatement() {
  const report = $('statementReport').value
  const paths = {
    'trial-balance': '/finance/statements/trial-balance',
    income: '/finance/statements/income',
    'balance-sheet': '/finance/statements/balance-sheet',
    ageing: '/finance/statements/ageing',
  }
  const path = paths[report]
  if (!path) return
  const params = new URLSearchParams()
  if (report === 'income') {
    if ($('statementFrom').value) params.set('from', $('statementFrom').value)
    if ($('statementTo').value) params.set('to', $('statementTo').value)
  } else {
    if ($('statementAsOf').value) params.set('asOf', $('statementAsOf').value)
    if (report === 'ageing' && $('statementDirection').value) params.set('direction', $('statementDirection').value)
  }
  const query = params.toString()
  setError('statementError', '')
  $('statementStatus').textContent = 'Running…'
  try {
    const result = await request(`${path}${query ? `?${query}` : ''}`)
    renderStatement(result.report || result)
  } catch (error) {
    $('statementStatus').textContent = ''
    setError('statementError', error.message)
  }
}

$('refreshFinance').onclick = () => loadFinance()

$('rateVerifyForm').onsubmit = async (event) => {
  event.preventDefault()
  const id = $('rateVerifyId').value
  const verifiedBy = $('rateVerifyBy').value.trim()
  if (!id || !verifiedBy) return
  $('rateVerifyStatus').textContent = 'Verifying…'
  try {
    await request(`/finance/statutory-rates/${encodeURIComponent(id)}/verify`, {
      method: 'POST',
      body: JSON.stringify({ verifiedBy, verificationNote: $('rateVerifyNote').value.trim() }),
    })
    $('rateVerifyStatus').textContent = 'Rate verified'
    $('rateVerifyNote').value = ''
    await loadFinance()
  } catch (error) {
    $('rateVerifyStatus').textContent = error.message
  }
}

$('partyForm').onsubmit = async (event) => {
  event.preventDefault()
  $('partyStatus').textContent = 'Creating…'
  try {
    await request('/finance/parties', {
      method: 'POST',
      body: JSON.stringify({
        type: $('partyType').value,
        name: $('partyName').value.trim(),
        taxPin: $('partyTaxPin').value.trim() || undefined,
        email: $('partyEmail').value.trim() || undefined,
        phone: $('partyPhone').value.trim() || undefined,
      }),
    })
    $('partyForm').reset()
    $('partyStatus').textContent = 'Party created'
    await loadFinance()
  } catch (error) {
    $('partyStatus').textContent = error.message
  }
}

$('invoiceForm').onsubmit = async (event) => {
  event.preventDefault()
  const description = $('invoiceLineDescription').value.trim()
  const qty = Number($('invoiceLineQty').value)
  const unitPriceCents = Number($('invoiceLineUnitPriceCents').value)
  if (!description || !(qty > 0) || !(unitPriceCents > 0)) {
    setError('invoiceError', 'Enter a description, a positive quantity and a positive unit price in cents.')
    return
  }
  setError('invoiceError', '')
  $('invoiceStatus').textContent = 'Creating…'
  try {
    await request('/finance/invoices', {
      method: 'POST',
      body: JSON.stringify({
        direction: $('invoiceDirection').value,
        type: $('invoiceType').value,
        partyId: $('invoiceParty').value,
        issueDate: $('invoiceIssueDate').value,
        dueDate: $('invoiceDueDate').value || undefined,
        taxInclusive: $('invoiceTaxInclusive').checked,
        taxRateId: $('invoiceTaxRateId').value || undefined,
        lines: [{ description, qty, unitPriceCents }],
      }),
    })
    $('invoiceStatus').textContent = 'Invoice created as DRAFT'
    await loadFinance()
  } catch (error) {
    $('invoiceStatus').textContent = ''
    setError('invoiceError', error.message)
  }
}

$('paymentForm').onsubmit = async (event) => {
  event.preventDefault()
  const invoiceId = $('paymentInvoiceId').value
  const allocationCents = Number($('paymentAllocationAmountCents').value) || 0
  const allocations = invoiceId && allocationCents > 0
    ? [{ invoiceId, amountCents: allocationCents }]
    : []
  $('paymentStatus').textContent = 'Recording…'
  try {
    await request('/finance/payments', {
      method: 'POST',
      body: JSON.stringify({
        direction: $('paymentDirection').value,
        partyId: $('paymentParty').value,
        method: $('paymentMethod').value,
        amountCents: Number($('paymentAmountCents').value),
        reference: $('paymentReference').value.trim() || undefined,
        allocations,
      }),
    })
    $('paymentStatus').textContent = 'Payment recorded'
    await loadFinance()
  } catch (error) {
    $('paymentStatus').textContent = error.message
  }
}

$('budgetForm').onsubmit = async (event) => {
  event.preventDefault()
  $('budgetStatus').textContent = 'Creating…'
  try {
    await request('/finance/budgets', {
      method: 'POST',
      body: JSON.stringify({
        code: $('budgetCode').value.trim(),
        name: $('budgetName').value.trim(),
        period: $('budgetPeriod').value,
        startDate: $('budgetStartDate').value,
        endDate: $('budgetEndDate').value,
        lines: [{
          accountId: $('budgetAccount').value,
          amountCents: Number($('budgetAmountCents').value),
        }],
      }),
    })
    $('budgetStatus').textContent = 'Budget created as DRAFT'
    await loadFinance()
  } catch (error) {
    $('budgetStatus').textContent = error.message
  }
}

$('statementForm').onsubmit = (event) => {
  event.preventDefault()
  runStatement()
}

function onFinanceEvent() {
  // Finance socket frames carry IDs/classification only. Ignore their content
  // and refetch authoritative data from the authenticated API when visible.
  if (state.view !== 'finance') return
  if (financeRefreshTimer) clearTimeout(financeRefreshTimer)
  financeRefreshTimer = setTimeout(() => {
    financeRefreshTimer = null
    loadFinance()
  }, 250)
}

// -------------------------------------------------------------------- sales

function shortId(value) {
  return value ? escapeHtml(String(value).slice(0, 8)) : '—'
}

function salesLineFrom(prefix) {
  return [{
    description: $(`${prefix}LineDescription`).value,
    qty: Number($(`${prefix}LineQty`).value),
    unitPriceCents: Number($(`${prefix}LineUnitPriceCents`).value),
  }]
}

function salesAction(action, id) {
  const safe = escapeHtml(id)
  const labels = {
    'convert-quote': 'Convert to order',
    'confirm-order': 'Confirm',
    'invoice-order': 'Create invoice',
    'issue-delivery': 'Issue',
    'deliver-delivery': 'Deliver',
    'approve-return': 'Approve',
    'receive-return': 'Receive',
  }
  return `<button class="link" type="button" data-sales-action="${action}" data-sales-id="${safe}">${labels[action] || action}</button>`
}

function renderSales() {
  renderFinanceRows('quoteRows', state.salesQuotes, [
    (quote) => `<code>${escapeHtml(quote.number)}</code>`,
    (quote) => escapeHtml(quote.quoteDate),
    (quote) => shortId(quote.partyId),
    (quote) => financeStatus(quote.status),
    (quote) => escapeHtml(quote.totalCents),
    (quote) => shortId(quote.taxRateId),
    (quote) => ['DRAFT', 'SENT', 'ACCEPTED'].includes(quote.status)
      ? salesAction('convert-quote', quote.id) : '',
  ], 'No sales quotes for this tenant.')

  renderFinanceRows('orderRows', state.salesOrders, [
    (order) => `<code>${escapeHtml(order.number)}</code>`,
    (order) => escapeHtml(order.orderDate),
    (order) => shortId(order.partyId),
    (order) => shortId(order.quoteId),
    (order) => financeStatus(order.status),
    (order) => escapeHtml(order.totalCents),
    (order) => shortId(order.financeInvoiceId),
    (order) => [
      order.status === 'DRAFT' ? salesAction('confirm-order', order.id) : '',
      order.status === 'CONFIRMED' && !order.financeInvoiceId ? salesAction('invoice-order', order.id) : '',
    ].join(' '),
  ], 'No sales orders for this tenant.')

  renderFinanceRows('deliveryRows', state.salesDeliveries, [
    (note) => `<code>${escapeHtml(note.number)}</code>`,
    (note) => escapeHtml(note.deliveryDate),
    (note) => shortId(note.orderId),
    (note) => financeStatus(note.status),
    (note) => escapeHtml(note.totalCents),
    (note) => [
      note.status === 'DRAFT' ? salesAction('issue-delivery', note.id) : '',
      ['ISSUED', 'IN_TRANSIT'].includes(note.status) ? salesAction('deliver-delivery', note.id) : '',
    ].join(' '),
  ], 'No delivery notes for this tenant.')

  renderFinanceRows('returnRows', state.salesReturns, [
    (record) => `<code>${escapeHtml(record.number)}</code>`,
    (record) => escapeHtml(record.returnDate),
    (record) => shortId(record.deliveryNoteId),
    (record) => financeStatus(record.status),
    (record) => escapeHtml(record.totalCents),
    (record) => [
      record.status === 'DRAFT' ? salesAction('approve-return', record.id) : '',
      record.status === 'APPROVED' ? salesAction('receive-return', record.id) : '',
    ].join(' '),
  ], 'No sales returns for this tenant.')

  const customers = state.salesCustomers.map((party) => ({ value: party.id, label: party.name || party.id }))
  for (const id of ['quoteParty', 'orderParty', 'deliveryParty', 'returnParty']) {
    fillFinanceSelect($(id), customers, 'Select a customer')
  }
  fillFinanceSelect($('quoteTaxRateId'), state.salesRates.map((rate) => ({
    value: rate.id,
    label: `${rate.code} — ${rate.label} (${rate.status})`,
  })), 'No rate reference')
  fillFinanceSelect($('orderQuoteId'), state.salesQuotes.map((quote) => ({
    value: quote.id,
    label: `${quote.number} — ${quote.status}`,
  })), 'Standalone order')
  fillFinanceSelect($('deliveryOrderId'), state.salesOrders.map((order) => ({
    value: order.id,
    label: `${order.number} — ${order.status}`,
  })), 'Manual delivery')
  fillFinanceSelect($('returnDeliveryId'), state.salesDeliveries.map((note) => ({
    value: note.id,
    label: `${note.number} — ${note.status}`,
  })), 'Manual return')

  $('salesView').querySelectorAll('[data-sales-action]').forEach((button) => {
    button.onclick = () => runSalesAction(button.dataset.salesAction, button.dataset.salesId)
  })
}

async function loadSales() {
  if (!token) return
  setError('salesError', '')
  const [quotes, orders, deliveries, returns, customers, rates] = await Promise.allSettled([
    request('/sales/quotes?limit=200'),
    request('/sales/orders?limit=200'),
    request('/sales/deliveries?limit=200'),
    request('/sales/returns?limit=200'),
    request('/finance/parties?type=CUSTOMER&limit=200'),
    request('/finance/statutory-rates?kind=VAT&limit=200'),
  ])
  const failures = []
  const assign = (result, label, setter, key) => {
    if (result.status === 'fulfilled') setter(financeList(result.value, key))
    else failures.push(`${label}: ${result.reason?.message || 'unavailable'}`)
  }
  assign(quotes, 'Quotes', (value) => { state.salesQuotes = value }, 'quotes')
  assign(orders, 'Orders', (value) => { state.salesOrders = value }, 'orders')
  assign(deliveries, 'Deliveries', (value) => { state.salesDeliveries = value }, 'deliveries')
  assign(returns, 'Returns', (value) => { state.salesReturns = value }, 'returns')
  assign(customers, 'Customers', (value) => { state.salesCustomers = value }, 'parties')
  assign(rates, 'Rates', (value) => { state.salesRates = value }, 'rates')
  renderSales()
  if (failures.length) setError('salesError', failures.join(' · '))
}

async function salesMutation(path, body, statusId, message) {
  setError('salesError', '')
  if ($(statusId)) $(statusId).textContent = 'Working…'
  try {
    await request(path, { method: 'POST', body: JSON.stringify(body) })
    if ($(statusId)) $(statusId).textContent = message
    await loadSales()
    return true
  } catch (error) {
    if ($(statusId)) $(statusId).textContent = ''
    setError('salesError', error.status === 409 ? `Transition blocked: ${error.message}` : error.message)
    return false
  }
}

async function runSalesAction(action, id) {
  if (!id) return
  const path = {
    'convert-quote': `/sales/quotes/${encodeURIComponent(id)}/convert`,
    'confirm-order': `/sales/orders/${encodeURIComponent(id)}/confirm`,
    'invoice-order': `/sales/orders/${encodeURIComponent(id)}/invoice`,
    'issue-delivery': `/sales/deliveries/${encodeURIComponent(id)}/issue`,
    'deliver-delivery': `/sales/deliveries/${encodeURIComponent(id)}/deliver`,
    'approve-return': `/sales/returns/${encodeURIComponent(id)}/approve`,
    'receive-return': `/sales/returns/${encodeURIComponent(id)}/receive`,
  }[action]
  if (!path) return
  // Invoice creation omits taxRateId deliberately: finance applies the verified
  // effective rate and rejects the issue if none exists. Transition endpoints
  // ignore the body entirely.
  const messages = {
    'convert-quote': 'Quote converted to a draft order',
    'confirm-order': 'Order confirmed',
    'invoice-order': 'Invoice request sent — finance applies a VERIFIED rate or rejects',
    'issue-delivery': 'Delivery note issued',
    'deliver-delivery': 'Delivery note marked delivered',
    'approve-return': 'Return approved',
    'receive-return': 'Return received',
  }
  await salesMutation(path, {}, 'salesActionStatus', messages[action] || '')
}

function onSalesEvent() {
  // Sales socket frames carry IDs/classification only. Never render them as
  // content; refetch authoritative records through the authenticated API.
  if (state.view !== 'sales') return
  if (salesRefreshTimer) clearTimeout(salesRefreshTimer)
  salesRefreshTimer = setTimeout(() => {
    salesRefreshTimer = null
    loadSales()
  }, 250)
}

$('refreshSales').onclick = () => loadSales()

$('quoteForm').onsubmit = async (event) => {
  event.preventDefault()
  const body = {
    partyId: $('quoteParty').value,
    quoteDate: $('quoteDate').value,
    lines: salesLineFrom('quote'),
  }
  if ($('quoteValidUntil').value) body.validUntil = $('quoteValidUntil').value
  if ($('quoteTaxRateId').value) body.taxRateId = $('quoteTaxRateId').value
  if ($('quoteNotes').value) body.notes = $('quoteNotes').value
  await salesMutation('/sales/quotes', body, 'quoteStatus', 'Quote created as DRAFT')
}

$('orderForm').onsubmit = async (event) => {
  event.preventDefault()
  const quoteId = $('orderQuoteId').value
  const quote = state.salesQuotes.find((item) => item.id === quoteId)
  const body = {
    partyId: quote ? quote.partyId : $('orderParty').value,
    orderDate: $('orderDate').value,
    ...(quoteId ? { quoteId } : { lines: salesLineFrom('order') }),
  }
  if ($('orderRequestedDate').value) body.requestedDate = $('orderRequestedDate').value
  await salesMutation('/sales/orders', body, 'orderStatus', 'Order created as DRAFT')
}

$('deliveryForm').onsubmit = async (event) => {
  event.preventDefault()
  const orderId = $('deliveryOrderId').value
  const order = state.salesOrders.find((item) => item.id === orderId)
  const body = {
    partyId: order ? order.partyId : $('deliveryParty').value,
    deliveryDate: $('deliveryDate').value,
    ...(orderId ? { orderId } : { lines: salesLineFrom('delivery') }),
  }
  await salesMutation('/sales/deliveries', body, 'deliveryStatus', 'Delivery note created as DRAFT')
}

$('returnForm').onsubmit = async (event) => {
  event.preventDefault()
  const deliveryNoteId = $('returnDeliveryId').value
  const delivery = state.salesDeliveries.find((item) => item.id === deliveryNoteId)
  const body = {
    partyId: delivery ? delivery.partyId : $('returnParty').value,
    returnDate: $('returnDate').value,
    ...(deliveryNoteId ? { deliveryNoteId } : { lines: salesLineFrom('return') }),
  }
  if ($('returnReason').value) body.reason = $('returnReason').value
  await salesMutation('/sales/returns', body, 'returnStatus', 'Return created as DRAFT')
}

// ------------------------------------------------------------------ inventory

function inventoryToday() {
  return new Date().toISOString().slice(0, 10)
}

function inventoryMutation(path, body, statusId, message) {
  setError('inventoryError', '')
  if ($(statusId)) $(statusId).textContent = 'Working…'
  return request(path, { method: 'POST', body: JSON.stringify(body) })
    .then(async () => {
      if ($(statusId)) $(statusId).textContent = message
      await loadInventory()
      return true
    })
    .catch((error) => {
      if ($(statusId)) $(statusId).textContent = ''
      setError('inventoryError', error.status === 409 ? `Transition blocked: ${error.message}` : error.message)
      return false
    })
}

function inventoryActionLabel(action) {
  return {
    'approve-transfer': 'Approve',
    'receive-transfer': 'Receive',
    'cancel-transfer': 'Cancel',
    'record-count': 'Record',
    'approve-count': 'Approve',
    'cancel-count': 'Cancel',
  }[action] || action
}

function inventoryAction(action, id) {
  return `<button class="link" type="button" data-inventory-action="${action}" data-inventory-id="${escapeHtml(id)}">${inventoryActionLabel(action)}</button>`
}

function inventoryItemOptions() {
  return state.inventoryItems.map((item) => ({
    value: item.id,
    label: `${item.code} — ${item.name}`,
  }))
}

function inventoryWarehouseOptions() {
  return state.inventoryWarehouses.map((warehouse) => ({
    value: warehouse.id,
    label: `${warehouse.code} — ${warehouse.name}`,
  }))
}

function inventoryBatchOptions(itemId) {
  return state.inventoryBatches
    .filter((batch) => !itemId || batch.itemId === itemId)
    .map((batch) => ({ value: batch.id, label: `${batch.batchNumber} — ${batch.status}` }))
}

function refreshInventoryBatchSelects() {
  fillFinanceSelect($('invStockBatch'), inventoryBatchOptions($('invStockItem').value), 'Unbatched')
  fillFinanceSelect($('invTransferBatch'), inventoryBatchOptions($('invTransferItem').value), 'Unbatched')
  fillFinanceSelect($('invCountBatch'), inventoryBatchOptions($('invCountItem').value), 'Unbatched')
}

function renderInventory() {
  renderFinanceRows('inventoryItemRows', state.inventoryItems, [
    (item) => `<code>${escapeHtml(item.code)}</code>`,
    (item) => escapeHtml(item.name),
    (item) => escapeHtml(item.type),
    (item) => escapeHtml(item.unit),
    (item) => escapeHtml(item.standardCostCents),
    (item) => escapeHtml(item.reorderLevel),
    (item) => (item.trackBatches ? 'Yes' : 'No'),
    (item) => `<code>${escapeHtml(String(item.id).slice(0, 8))}</code>`,
  ], 'No inventory items for this tenant.')

  renderFinanceRows('inventoryWarehouseRows', state.inventoryWarehouses, [
    (warehouse) => `<code>${escapeHtml(warehouse.code)}</code>`,
    (warehouse) => escapeHtml(warehouse.name),
    (warehouse) => escapeHtml(warehouse.location || '—'),
    (warehouse) => (warehouse.isActive ? 'Active' : 'Inactive'),
  ], 'No warehouses for this tenant.')

  const itemsById = new Map(state.inventoryItems.map((item) => [item.id, item]))
  const warehousesById = new Map(state.inventoryWarehouses.map((warehouse) => [warehouse.id, warehouse]))
  renderFinanceRows('inventoryBatchRows', state.inventoryBatches, [
    (batch) => `<code>${escapeHtml(batch.batchNumber)}</code>`,
    (batch) => escapeHtml(itemsById.get(batch.itemId)?.code || String(batch.itemId).slice(0, 8)),
    (batch) => financeStatus(batch.status),
    (batch) => escapeHtml(batch.unitCostCents),
    (batch) => escapeHtml(batch.expiryDate || '—'),
  ], 'No inventory batches for this tenant.')

  renderFinanceRows('inventoryBalanceRows', state.inventoryBalances, [
    (balance) => escapeHtml(balance.itemCode || itemsById.get(balance.itemId)?.code || String(balance.itemId).slice(0, 8)),
    (balance) => escapeHtml(balance.warehouseCode || warehousesById.get(balance.warehouseId)?.code || String(balance.warehouseId).slice(0, 8)),
    (balance) => escapeHtml(balance.batchNumber || 'Unbatched'),
    (balance) => escapeHtml(balance.quantity),
    (balance) => escapeHtml(balance.unitCostCents),
    (balance) => escapeHtml(balance.totalValueCents),
  ], 'No stock balances for this tenant.')

  renderFinanceRows('inventoryMovementRows', state.inventoryMovements, [
    (movement) => `<code>${escapeHtml(movement.number)}</code>`,
    (movement) => financeStatus(movement.type),
    (movement) => escapeHtml(movement.movementDate),
    (movement) => escapeHtml(movement.itemCode || String(movement.itemId).slice(0, 8)),
    (movement) => escapeHtml(movement.warehouseCode || String(movement.warehouseId).slice(0, 8)),
    (movement) => escapeHtml(movement.quantity),
    (movement) => escapeHtml(movement.unitCostCents),
    (movement) => escapeHtml(movement.totalValueCents),
  ], 'No stock movements for this tenant.')

  renderFinanceRows('inventoryTransferRows', state.inventoryTransfers, [
    (transfer) => `<code>${escapeHtml(transfer.number)}</code>`,
    (transfer) => escapeHtml(transfer.transferDate),
    (transfer) => escapeHtml(warehousesById.get(transfer.sourceWarehouseId)?.code || String(transfer.sourceWarehouseId).slice(0, 8)),
    (transfer) => escapeHtml(warehousesById.get(transfer.destinationWarehouseId)?.code || String(transfer.destinationWarehouseId).slice(0, 8)),
    (transfer) => financeStatus(transfer.status),
    (transfer) => [
      transfer.status === 'DRAFT' ? inventoryAction('approve-transfer', transfer.id) : '',
      transfer.status === 'IN_TRANSIT' ? inventoryAction('receive-transfer', transfer.id) : '',
      ['DRAFT', 'IN_TRANSIT'].includes(transfer.status) ? inventoryAction('cancel-transfer', transfer.id) : '',
    ].join(' '),
  ], 'No stock transfers for this tenant.')

  renderFinanceRows('inventoryCountRows', state.inventoryCounts, [
    (count) => `<code>${escapeHtml(count.number)}</code>`,
    (count) => escapeHtml(count.countDate),
    (count) => escapeHtml(warehousesById.get(count.warehouseId)?.code || String(count.warehouseId).slice(0, 8)),
    (count) => financeStatus(count.status),
    (count) => [
      ['DRAFT', 'COUNTING'].includes(count.status) ? inventoryAction('record-count', count.id) : '',
      ['DRAFT', 'COUNTING'].includes(count.status) ? inventoryAction('approve-count', count.id) : '',
      ['DRAFT', 'COUNTING'].includes(count.status) ? inventoryAction('cancel-count', count.id) : '',
    ].join(' '),
  ], 'No stock counts for this tenant.')

  renderFinanceRows('inventoryAlertRows', state.inventoryAlerts, [
    (alert) => escapeHtml(alert.itemCode || String(alert.itemId).slice(0, 8)),
    (alert) => escapeHtml(alert.warehouseCode || String(alert.warehouseId).slice(0, 8)),
    (alert) => escapeHtml(alert.batchId ? String(alert.batchId).slice(0, 8) : 'Unbatched'),
    (alert) => escapeHtml(alert.quantity),
    (alert) => escapeHtml(alert.reorderLevel),
    (alert) => escapeHtml(alert.unit || '—'),
  ], 'No reorder alerts for this tenant.')

  const itemOptions = inventoryItemOptions()
  const warehouseOptions = inventoryWarehouseOptions()
  fillFinanceSelect($('invBatchItem'), itemOptions, 'Select an item')
  fillFinanceSelect($('invStockItem'), itemOptions, 'Select an item')
  fillFinanceSelect($('invTransferItem'), itemOptions, 'Select an item')
  fillFinanceSelect($('invCountItem'), itemOptions, 'Select an item')
  fillFinanceSelect($('invStockWarehouse'), warehouseOptions, 'Select a warehouse')
  fillFinanceSelect($('invTransferSource'), warehouseOptions, 'Select a source')
  fillFinanceSelect($('invTransferDestination'), warehouseOptions, 'Select a destination')
  fillFinanceSelect($('invCountWarehouse'), warehouseOptions, 'Select a warehouse')
  refreshInventoryBatchSelects()

  $('inventoryView').querySelectorAll('[data-inventory-action]').forEach((button) => {
    button.onclick = () => runInventoryAction(button.dataset.inventoryAction, button.dataset.inventoryId)
  })
}

async function loadInventory() {
  if (!token) return
  setError('inventoryError', '')
  const [items, warehouses, batches, balances, movements, transfers, counts, alerts] = await Promise.allSettled([
    request('/inventory/items?limit=200'),
    request('/inventory/warehouses?limit=200'),
    request('/inventory/batches?limit=200'),
    request('/inventory/balances?limit=200'),
    request('/inventory/movements?limit=200'),
    request('/inventory/transfers?limit=200'),
    request('/inventory/counts?limit=200'),
    request('/inventory/alerts?limit=200'),
  ])
  const failures = []
  const assign = (result, label, setter, key) => {
    if (result.status === 'fulfilled') setter(financeList(result.value, key))
    else failures.push(`${label}: ${result.reason?.message || 'unavailable'}`)
  }
  assign(items, 'Items', (value) => { state.inventoryItems = value }, 'items')
  assign(warehouses, 'Warehouses', (value) => { state.inventoryWarehouses = value }, 'warehouses')
  assign(batches, 'Batches', (value) => { state.inventoryBatches = value }, 'batches')
  assign(balances, 'Balances', (value) => { state.inventoryBalances = value }, 'balances')
  assign(movements, 'Movements', (value) => { state.inventoryMovements = value }, 'movements')
  assign(transfers, 'Transfers', (value) => { state.inventoryTransfers = value }, 'transfers')
  assign(counts, 'Counts', (value) => { state.inventoryCounts = value }, 'counts')
  assign(alerts, 'Alerts', (value) => { state.inventoryAlerts = value }, 'alerts')
  const day = inventoryToday()
  for (const field of ['invStockDate', 'invTransferDate', 'invCountDate']) {
    if ($(field) && !$(field).value) $(field).value = day
  }
  renderInventory()
  if (failures.length) setError('inventoryError', failures.join(' · '))
}

function inventoryBody(base, batchField = 'invStockBatch') {
  const batchId = $(batchField).value
  return { ...base, ...(batchId ? { batchId } : { batchId: null }) }
}

async function runInventoryAction(action, id) {
  if (!id) return
  const paths = {
    'approve-transfer': `/inventory/transfers/${encodeURIComponent(id)}/approve`,
    'receive-transfer': `/inventory/transfers/${encodeURIComponent(id)}/receive`,
    'cancel-transfer': `/inventory/transfers/${encodeURIComponent(id)}/cancel`,
    'approve-count': `/inventory/counts/${encodeURIComponent(id)}/approve`,
    'cancel-count': `/inventory/counts/${encodeURIComponent(id)}/cancel`,
  }
  if (action === 'record-count') {
    const count = state.inventoryCounts.find((entry) => entry.id === id)
    const line = count?.lines?.[0]
    if (!line) {
      setError('inventoryError', 'Select a stock count with a line to record')
      return false
    }
    return inventoryMutation(`/inventory/counts/${encodeURIComponent(id)}/record`, {
      lines: [{
        itemId: line.itemId,
        ...(line.batchId ? { batchId: line.batchId } : { batchId: null }),
        countedQty: Number($('invCountedQty').value),
        position: line.position ?? 0,
      }],
    }, 'inventoryActionStatus', 'Stock count recorded')
  }
  const path = paths[action]
  if (!path) return false
  return inventoryMutation(path, {}, 'inventoryActionStatus', `${inventoryActionLabel(action)} completed`)
}

function onInventoryEvent() {
  // Inventory socket frames carry IDs/classification only. Never render their
  // payload as stock content — refetch authoritative data over the API.
  if (state.view !== 'inventory') return
  if (inventoryRefreshTimer) clearTimeout(inventoryRefreshTimer)
  inventoryRefreshTimer = setTimeout(() => {
    inventoryRefreshTimer = null
    loadInventory()
  }, 250)
}

$('refreshInventory').onclick = () => loadInventory()
$('invStockItem').onchange = refreshInventoryBatchSelects
$('invTransferItem').onchange = refreshInventoryBatchSelects
$('invCountItem').onchange = refreshInventoryBatchSelects

$('inventoryItemForm').onsubmit = async (event) => {
  event.preventDefault()
  const body = {
    code: $('invItemCode').value,
    name: $('invItemName').value,
    type: $('invItemType').value,
    unit: $('invItemUnit').value,
    standardCostCents: Number($('invItemCost').value),
    reorderLevel: Number($('invItemReorder').value),
    trackBatches: $('invItemTrackBatches').checked,
    classification: $('invItemClassification').value,
  }
  const ok = await inventoryMutation('/inventory/items', body, 'invItemStatus', 'Item created')
  if (ok) $('inventoryItemForm').reset()
}

$('inventoryWarehouseForm').onsubmit = async (event) => {
  event.preventDefault()
  const body = {
    code: $('invWarehouseCode').value,
    name: $('invWarehouseName').value,
    location: $('invWarehouseLocation').value,
  }
  const ok = await inventoryMutation('/inventory/warehouses', body, 'invWarehouseStatus', 'Warehouse created')
  if (ok) $('inventoryWarehouseForm').reset()
}

$('inventoryBatchForm').onsubmit = async (event) => {
  event.preventDefault()
  const body = {
    itemId: $('invBatchItem').value,
    batchNumber: $('invBatchNumber').value,
    status: $('invBatchStatus').value,
    unitCostCents: Number($('invBatchCost').value),
    expiryDate: $('invBatchExpiry').value || null,
  }
  const ok = await inventoryMutation('/inventory/batches', body, 'invBatchStatusText', 'Batch created')
  if (ok) $('inventoryBatchForm').reset()
}

$('inventoryStockForm').onsubmit = async (event) => {
  event.preventDefault()
  const operation = $('invStockOperation').value
  const base = inventoryBody({
    itemId: $('invStockItem').value,
    warehouseId: $('invStockWarehouse').value,
    quantity: Number($('invStockQuantity').value),
    movementDate: $('invStockDate').value,
  })
  let path
  let message
  if (operation === 'receipts') {
    Object.assign(base, {
      unitCostCents: Number($('invStockCost').value),
      notes: $('invStockNotes').value,
    })
    path = '/inventory/stock/receipts'
    message = 'Stock received'
  } else if (operation === 'issues') {
    Object.assign(base, { notes: $('invStockNotes').value })
    path = '/inventory/stock/issues'
    message = 'Stock issued'
  } else {
    Object.assign(base, {
      direction: $('invStockDirection').value,
      unitCostCents: Number($('invStockCost').value),
      reason: $('invStockNotes').value || 'ERP adjustment',
    })
    path = '/inventory/stock/adjustments'
    message = 'Adjustment posted'
  }
  await inventoryMutation(path, base, 'invStockStatus', message)
}

$('inventoryTransferForm').onsubmit = async (event) => {
  event.preventDefault()
  const body = {
    sourceWarehouseId: $('invTransferSource').value,
    destinationWarehouseId: $('invTransferDestination').value,
    transferDate: $('invTransferDate').value,
    lines: [inventoryBody({
      itemId: $('invTransferItem').value,
      quantity: Number($('invTransferQuantity').value),
      position: 0,
    }, 'invTransferBatch')],
  }
  const ok = await inventoryMutation('/inventory/transfers', body, 'invTransferStatus', 'Transfer created as DRAFT')
  if (ok) $('inventoryTransferForm').reset()
}

$('inventoryCountForm').onsubmit = async (event) => {
  event.preventDefault()
  const body = {
    warehouseId: $('invCountWarehouse').value,
    countDate: $('invCountDate').value,
    lines: [inventoryBody({
      itemId: $('invCountItem').value,
      countedQty: Number($('invCountedQty').value),
      position: 0,
    }, 'invCountBatch')],
  }
  const ok = await inventoryMutation('/inventory/counts', body, 'invCountStatus', 'Stock count started as DRAFT')
  if (ok) $('inventoryCountForm').reset()
}

// -------------------------------------------------------------- procurement

function procurementToday() {
  return new Date().toISOString().slice(0, 10)
}

function procurementNotes(id) {
  const value = $(id)?.value?.trim()
  return value ? value : undefined
}

function procurementOptionalId(id) {
  const value = $(id)?.value
  return value ? value : undefined
}

function procurementMutation(path, body, statusId, message) {
  setError('procurementError', '')
  if ($(statusId)) $(statusId).textContent = 'Working…'
  return request(path, { method: 'POST', body: JSON.stringify(body) })
    .then(async () => {
      if ($(statusId)) $(statusId).textContent = message
      await loadProcurement()
      return true
    })
    .catch((error) => {
      if ($(statusId)) $(statusId).textContent = ''
      setError('procurementError', error.status === 409 ? `Transition blocked: ${error.message}` : error.message)
      return false
    })
}

function procurementActionLabel(action) {
  return {
    'submit-requisition': 'Submit',
    'approve-requisition': 'Approve',
    'convert-requisition': 'Convert to PO',
    'approve-order': 'Approve',
    'send-order': 'Send',
    'inspect-receipt': 'Inspect',
    'reject-receipt': 'Reject',
    'approve-return': 'Approve',
    'approve-match': 'Approve',
  }[action] || action
}

function procurementAction(action, id) {
  return `<button class="link" type="button" data-procurement-action="${action}" data-procurement-id="${escapeHtml(id)}">${procurementActionLabel(action)}</button>`
}

function procurementCode(id, rows, prefix) {
  const row = rows.find((entry) => entry.id === id)
  return row ? `<code>${escapeHtml(row.number || (prefix ? `${prefix}-${String(id).slice(0, 8)}` : String(id).slice(0, 8)))}</code>` : '—'
}

function refreshProcurementBatchSelects(itemSelectId, batchSelectId) {
  const itemId = $(itemSelectId)?.value
  const options = state.inventoryBatches
    .filter((batch) => !itemId || batch.itemId === itemId)
    .map((batch) => ({ value: batch.id, label: `${batch.batchNumber} — ${batch.status}` }))
  fillFinanceSelect($(batchSelectId), options, 'Unbatched / auto')
}

function procurementDocumentLine(rows, parentId, itemId) {
  const parent = rows.find((row) => row.id === parentId)
  return (parent?.lines || []).find((line) => line.itemId === itemId) || null
}

function procurementItemOptions() {
  return state.inventoryItems.map((item) => ({ value: item.id, label: `${item.code} — ${item.name}` }))
}

function procurementWarehouseOptions() {
  return state.inventoryWarehouses.map((warehouse) => ({
    value: warehouse.id,
    label: `${warehouse.code} — ${warehouse.name}`,
  }))
}

function renderProcurement() {
  const orders = state.procurementOrders
  const receipts = state.procurementReceipts

  renderFinanceRows('procurementRequisitionRows', state.procurementRequisitions, [
    (row) => `<code>${escapeHtml(row.number)}</code>`,
    (row) => escapeHtml(row.requisitionDate),
    (row) => financeStatus(row.status),
    (row) => escapeHtml(row.classification),
    (row) => [
      row.status === 'DRAFT' ? procurementAction('submit-requisition', row.id) : '',
      row.status === 'SUBMITTED' ? procurementAction('approve-requisition', row.id) : '',
      row.status === 'APPROVED' ? procurementAction('convert-requisition', row.id) : '',
    ].join(' '),
  ], 'No purchase requisitions for this tenant.')

  renderFinanceRows('procurementOrderRows', orders, [
    (row) => `<code>${escapeHtml(row.number)}</code>`,
    (row) => escapeHtml(row.orderDate),
    (row) => {
      const supplier = state.financeParties.find((party) => party.id === row.supplierId)
      return escapeHtml(supplier?.name || String(row.supplierId).slice(0, 8))
    },
    (row) => financeStatus(row.status),
    (row) => [
      row.status === 'DRAFT' ? procurementAction('approve-order', row.id) : '',
      row.status === 'APPROVED' ? procurementAction('send-order', row.id) : '',
    ].join(' '),
  ], 'No purchase orders for this tenant.')

  renderFinanceRows('procurementReceiptRows', receipts, [
    (row) => `<code>${escapeHtml(row.number)}</code>`,
    (row) => escapeHtml(row.receiptDate),
    (row) => procurementCode(row.orderId, orders, 'PO'),
    (row) => financeStatus(row.status),
    (row) => [
      row.status === 'RECEIVED' ? procurementAction('inspect-receipt', row.id) : '',
      row.status === 'RECEIVED' ? procurementAction('reject-receipt', row.id) : '',
    ].join(' '),
  ], 'No goods receipt notes for this tenant.')

  renderFinanceRows('procurementReturnRows', state.procurementReturns, [
    (row) => `<code>${escapeHtml(row.number)}</code>`,
    (row) => escapeHtml(row.returnDate),
    (row) => procurementCode(row.receiptId, receipts, 'GRN'),
    (row) => financeStatus(row.status),
    (row) => (row.status === 'DRAFT' ? procurementAction('approve-return', row.id) : ''),
  ], 'No supplier returns for this tenant.')

  renderFinanceRows('procurementMatchRows', state.procurementMatches, [
    (row) => `<code>${escapeHtml(row.number)}</code>`,
    (row) => procurementCode(row.orderId, orders, 'PO'),
    (row) => procurementCode(row.receiptId, receipts, 'GRN'),
    (row) => procurementCode(row.financeInvoiceId, state.financeInvoices, 'INV'),
    (row) => financeStatus(row.status),
    (row) => escapeHtml(row.priceVarianceCents),
    (row) => (['MATCHED', 'DISCREPANCY'].includes(row.status) ? procurementAction('approve-match', row.id) : ''),
  ], 'No three-way matches for this tenant.')

  const itemOptions = procurementItemOptions()
  const warehouseOptions = procurementWarehouseOptions()
  const supplierOptions = state.financeParties
    .filter((party) => party.type === 'SUPPLIER')
    .map((party) => ({ value: party.id, label: `${party.name} (${party.type})` }))
  const orderOptions = orders.map((row) => ({ value: row.id, label: `${row.number} — ${row.status}` }))
  const receiptOptions = receipts.map((row) => ({ value: row.id, label: `${row.number} — ${row.status}` }))
  const invoiceOptions = state.financeInvoices
    .filter((invoice) => !invoice.direction || invoice.direction === 'PURCHASE')
    .map((invoice) => ({ value: invoice.id, label: `${invoice.number} — ${invoice.totalCents} cents` }))

  for (const id of ['procReqItem', 'procOrderItem', 'procGrnItem', 'procReturnItem']) {
    fillFinanceSelect($(id), itemOptions, 'Select an item')
  }
  for (const id of ['procReqWarehouse', 'procOrderWarehouse', 'procGrnWarehouse', 'procReturnWarehouse']) {
    fillFinanceSelect($(id), warehouseOptions, 'Default / company-wide')
  }
  fillFinanceSelect($('procOrderSupplier'), supplierOptions, 'Select a supplier')
  for (const id of ['procGrnOrder', 'procMatchOrder']) fillFinanceSelect($(id), orderOptions, 'Select a purchase order')
  fillFinanceSelect($('procMatchReceipt'), receiptOptions, 'Select a goods receipt')
  fillFinanceSelect($('procReturnReceipt'), receiptOptions, 'Select a goods receipt')
  fillFinanceSelect($('procMatchInvoice'), invoiceOptions, 'No invoice linked')
  refreshProcurementBatchSelects('procGrnItem', 'procGrnBatch')
  refreshProcurementBatchSelects('procReturnItem', 'procReturnBatch')

  const today = procurementToday()
  for (const field of ['procReqDate', 'procOrderDate', 'procGrnDate', 'procReturnDate']) {
    if ($(field) && !$(field).value) $(field).value = today
  }

  $('procurementView').querySelectorAll('[data-procurement-action]').forEach((button) => {
    button.onclick = () => runProcurementAction(button.dataset.procurementAction, button.dataset.procurementId)
  })
}

async function loadProcurement() {
  if (!token) return
  setError('procurementError', '')
  const results = await Promise.allSettled([
    request('/procurement/requisitions?limit=200'),
    request('/procurement/orders?limit=200'),
    request('/procurement/receipts?limit=200'),
    request('/procurement/returns?limit=200'),
    request('/procurement/matches?limit=200'),
    request('/finance/parties?type=SUPPLIER&limit=200'),
    request('/finance/invoices?direction=PURCHASE&limit=200'),
    request('/inventory/items?limit=200'),
    request('/inventory/warehouses?limit=200'),
    request('/inventory/batches?limit=200'),
  ])
  const failures = []
  const assign = (result, label, setter, key) => {
    if (result.status === 'fulfilled') setter(financeList(result.value, key))
    else failures.push(`${label}: ${result.reason?.message || 'unavailable'}`)
  }
  assign(results[0], 'Requisitions', (value) => { state.procurementRequisitions = value }, 'requisitions')
  assign(results[1], 'Orders', (value) => { state.procurementOrders = value }, 'orders')
  assign(results[2], 'Receipts', (value) => { state.procurementReceipts = value }, 'receipts')
  assign(results[3], 'Returns', (value) => { state.procurementReturns = value }, 'returns')
  assign(results[4], 'Matches', (value) => { state.procurementMatches = value }, 'matches')
  assign(results[5], 'Suppliers', (value) => { state.financeParties = value }, 'parties')
  assign(results[6], 'Invoices', (value) => { state.financeInvoices = value }, 'invoices')
  assign(results[7], 'Items', (value) => { state.inventoryItems = value }, 'items')
  assign(results[8], 'Warehouses', (value) => { state.inventoryWarehouses = value }, 'warehouses')
  assign(results[9], 'Batches', (value) => { state.inventoryBatches = value }, 'batches')
  renderProcurement()
  if (failures.length) setError('procurementError', failures.join(' · '))
}

async function runProcurementAction(action, id) {
  if (!id) return false
  const pathFor = (suffix) => `/procurement/${suffix}/${encodeURIComponent(id)}`
  const paths = {
    'submit-requisition': `${pathFor('requisitions')}/submit`,
    'approve-requisition': `${pathFor('requisitions')}/approve`,
    'approve-order': `${pathFor('orders')}/approve`,
    'send-order': `${pathFor('orders')}/send`,
    'approve-return': `${pathFor('returns')}/approve`,
    'approve-match': `${pathFor('matches')}/approve`,
  }
  if (action === 'convert-requisition') {
    const supplierId = $('procOrderSupplier').value
    if (!supplierId) {
      setError('procurementError', 'Select a supplier before converting a requisition')
      return false
    }
    return procurementMutation(`${pathFor('requisitions')}/convert`, { supplierId },
      'procurementActionStatus', 'Purchase order created')
  }
  if (action === 'inspect-receipt' || action === 'reject-receipt') {
    const decision = action === 'reject-receipt' ? 'REJECT' : 'ACCEPT'
    return procurementMutation(`${pathFor('receipts')}/inspect`, { decision },
      'procurementActionStatus', `Goods receipt ${decision === 'REJECT' ? 'rejected' : 'inspected'}`)
  }
  const path = paths[action]
  if (!path) return false
  return procurementMutation(path, {}, 'procurementActionStatus', `${procurementActionLabel(action)} completed`)
}

function onProcurementEvent() {
  // Procurement frames carry IDs/classification only. Never treat a frame as
  // document content — reload through the authenticated API instead.
  if (state.view !== 'procurement') return
  if (procurementRefreshTimer) clearTimeout(procurementRefreshTimer)
  procurementRefreshTimer = setTimeout(() => {
    procurementRefreshTimer = null
    loadProcurement()
  }, 250)
}

$('refreshProcurement').onclick = () => loadProcurement()
$('procGrnItem').onchange = () => refreshProcurementBatchSelects('procGrnItem', 'procGrnBatch')
$('procReturnItem').onchange = () => refreshProcurementBatchSelects('procReturnItem', 'procReturnBatch')

$('procurementRequisitionForm').onsubmit = async (event) => {
  event.preventDefault()
  const itemId = $('procReqItem').value
  const item = state.inventoryItems.find((entry) => entry.id === itemId)
  const body = {
    requisitionDate: $('procReqDate').value,
    classification: $('procReqClassification').value,
    lines: [{
      itemId,
      description: item ? `${item.code} — ${item.name}` : 'Purchase requisition line',
      qty: Number($('procReqQty').value),
      unitCostCents: Number($('procReqUnitCostCents').value),
      ...(procurementOptionalId('procReqWarehouse') ? { warehouseId: procurementOptionalId('procReqWarehouse') } : {}),
    }],
  }
  const notes = procurementNotes('procReqNotes')
  if (notes) body.notes = notes
  await procurementMutation('/procurement/requisitions', body, 'procReqStatus', 'Requisition created as DRAFT')
}

$('procurementOrderForm').onsubmit = async (event) => {
  event.preventDefault()
  const itemId = $('procOrderItem').value
  const item = state.inventoryItems.find((entry) => entry.id === itemId)
  const body = {
    supplierId: $('procOrderSupplier').value,
    orderDate: $('procOrderDate').value,
    classification: $('procOrderClassification').value,
    lines: [{
      itemId,
      description: item ? `${item.code} — ${item.name}` : 'Purchase order line',
      qty: Number($('procOrderQty').value),
      unitCostCents: Number($('procOrderUnitCostCents').value),
      ...(procurementOptionalId('procOrderWarehouse') ? { warehouseId: procurementOptionalId('procOrderWarehouse') } : {}),
    }],
  }
  const notes = procurementNotes('procOrderNotes')
  if (notes) body.notes = notes
  await procurementMutation('/procurement/orders', body, 'procOrderStatus', 'Purchase order created as DRAFT')
}

$('procurementReceiptForm').onsubmit = async (event) => {
  event.preventDefault()
  const itemId = $('procGrnItem').value
  const orderLine = procurementDocumentLine(state.procurementOrders, $('procGrnOrder').value, itemId)
  if (!orderLine) {
    setError('procurementError', 'Select an item that exists on the chosen purchase order')
    $('procGrnStatus').textContent = ''
    return
  }
  const body = {
    orderId: $('procGrnOrder').value,
    receiptDate: $('procGrnDate').value,
    lines: [{
      orderLineId: orderLine.id,
      qty: Number($('procGrnQty').value),
      unitCostCents: Number($('procGrnUnitCostCents').value),
      ...(procurementOptionalId('procGrnWarehouse') ? { warehouseId: procurementOptionalId('procGrnWarehouse') } : {}),
      ...(procurementOptionalId('procGrnBatch') ? { batchId: procurementOptionalId('procGrnBatch') } : {}),
    }],
  }
  const notes = procurementNotes('procGrnNotes')
  if (notes) body.notes = notes
  await procurementMutation('/procurement/receipts', body, 'procGrnStatus', 'Goods received and stock posted')
}

$('procurementReturnForm').onsubmit = async (event) => {
  event.preventDefault()
  const receiptId = $('procReturnReceipt').value
  const receipt = state.procurementReceipts.find((row) => row.id === receiptId)
  const itemId = $('procReturnItem').value
  const receiptLine = procurementDocumentLine(state.procurementReceipts, receiptId, itemId)
  if (!receipt || !receiptLine) {
    setError('procurementError', 'Select an item that exists on the chosen goods receipt')
    $('procReturnStatus').textContent = ''
    return
  }
  const body = {
    orderId: receipt.orderId,
    receiptId,
    returnDate: $('procReturnDate').value,
    lines: [{
      receiptLineId: receiptLine.id,
      itemId,
      description: receiptLine.description || 'Supplier return line',
      qty: Number($('procReturnQty').value),
      unitCostCents: Number(receiptLine.unitCostCents || 0),
      ...(procurementOptionalId('procReturnWarehouse') ? { warehouseId: procurementOptionalId('procReturnWarehouse') } : {}),
      ...(procurementOptionalId('procReturnBatch') ? { batchId: procurementOptionalId('procReturnBatch') } : {}),
    }],
  }
  const reason = procurementNotes('procReturnReason')
  if (reason) body.reason = reason
  await procurementMutation('/procurement/returns', body, 'procReturnStatus', 'Supplier return created as DRAFT')
}

$('procurementMatchForm').onsubmit = async (event) => {
  event.preventDefault()
  const body = {
    orderId: $('procMatchOrder').value,
    receiptId: $('procMatchReceipt').value,
    classification: $('procMatchClassification').value,
  }
  const invoiceId = procurementOptionalId('procMatchInvoice')
  if (invoiceId) body.financeInvoiceId = invoiceId
  const notes = procurementNotes('procMatchNotes')
  if (notes) body.notes = notes
  await procurementMutation('/procurement/matches', body, 'procMatchStatus', 'Three-way match completed')
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
  if (!token) return
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
    // Phase 5 events carry IDs only: never render payload data as content,
    // always re-fetch the authoritative record over the authenticated API.
    socket.on('notification:new', () => {
      setUnreadBadge(state.unread + 1)
      if (state.view === 'notifications') refreshNotifications()
      setTimeout(() => refreshUnreadBadge(), 800)
    })
    socket.on('notification:read', () => {
      if (state.view === 'notifications') refreshNotifications()
      refreshUnreadBadge()
    })
    socket.on('workflow:task', () => refreshTasks())
    socket.on('workflow:completed', () => refreshInstances())
    socket.on('file:new', () => refreshFiles())
    socket.on('file:scanned', () => refreshFiles())
    socket.on('document:generated', () => refreshDocuments())
    socket.on('document:issued', () => refreshDocuments())
    // Phase 6 finance events are ID-only signals; onFinanceEvent ignores the
    // payload entirely and reloads the finance view through request().
    for (const event of FINANCE_EVENTS) socket.on(event, onFinanceEvent)
    // Phase 7 sales events are ID/classification-only company-room signals.
    for (const event of SALES_EVENTS) socket.on(event, onSalesEvent)
    // Phase 8 inventory events are ID/classification-only company-room signals.
    for (const event of INVENTORY_EVENTS) socket.on(event, onInventoryEvent)
    // Phase 9 procurement events are ID/classification-only company-room signals.
    for (const event of PROCUREMENT_EVENTS) socket.on(event, onProcurementEvent)
  })
}

window.addEventListener('online', () => {
  if (token) flushQueue().then(refreshInbox)
})

// ------------------------------------------------------------------ views

function showView(view) {
  state.view = view
  for (const name of VIEWS) {
    $(`${name}View`).hidden = name !== view
    $(`tab${titleCase(name)}`).classList.toggle('active', name === view)
  }
  if (view === 'inbox') refreshInbox()
  else if (view === 'directory') loadDirectory()
  else if (view === 'notifications') {
    refreshNotifications()
    loadPreferences()
  } else if (view === 'files') refreshFiles()
  else if (view === 'workflow') refreshWorkflow()
  else if (view === 'search') refreshSearch()
  else if (view === 'documents') {
    loadDocumentKinds()
    refreshDocuments()
  }
  else if (view === 'finance') loadFinance()
  else if (view === 'sales') loadSales()
  else if (view === 'inventory') loadInventory()
  else if (view === 'procurement') loadProcurement()
}

$('tabInbox').onclick = () => showView('inbox')
$('tabDirectory').onclick = () => showView('directory')
$('tabNotifications').onclick = () => showView('notifications')
$('tabFiles').onclick = () => showView('files')
$('tabWorkflow').onclick = () => showView('workflow')
$('tabSearch').onclick = () => showView('search')
$('tabDocuments').onclick = () => showView('documents')
$('tabFinance').onclick = () => showView('finance')
$('tabSales').onclick = () => showView('sales')
$('tabInventory').onclick = () => showView('inventory')
$('tabProcurement').onclick = () => showView('procurement')

// ------------------------------------------------------------------- boot

async function start() {
  try {
    const profile = await request('/auth/me')
    showDashboard(profile)
    await Promise.all([refreshInbox(), loadDirectory(), refreshUnreadBadge()])
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
