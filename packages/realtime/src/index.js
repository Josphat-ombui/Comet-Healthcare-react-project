// Comet Healthcare realtime server (Phase 4).
// Socket.IO transport + Redis adapter for horizontal scaling; domain events
// arrive from the outbox publisher via Redis Streams.

import http from 'node:http'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'
import { config } from './config.js'
import { extractToken, roomAllowed, verifyRealtimeToken } from './auth.js'
import { startEventRelay } from './events.js'

const httpServer = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/health/live') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'comet-realtime', time: new Date().toISOString() }))
    return
  }
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

const io = new Server(httpServer, {
  serveClient: true,
  cors: {
    origin: config.corsOrigins,
    credentials: true,
  },
})

io.use((socket, next) => {
  try {
    const token = extractToken(socket)
    if (!token) throw new Error('Missing realtime token')
    socket.data.claims = verifyRealtimeToken(token)
    next()
  } catch {
    next(new Error('unauthorized'))
  }
})

const presence = new Map()

function setPresence(userId, socketId, online) {
  let sockets = presence.get(userId)
  if (!sockets) {
    sockets = new Set()
    presence.set(userId, sockets)
  }
  if (online) sockets.add(socketId)
  else sockets.delete(socketId)
  if (!sockets.size) presence.delete(userId)
  return !sockets.size
}

io.on('connection', (socket) => {
  const claims = socket.data.claims
  const companyRoom = `company:${claims.companyId}`

  for (const room of claims.rooms) socket.join(room)
  setPresence(claims.sub, socket.id, true)
  io.to(companyRoom).emit('presence:update', { userId: claims.sub, online: true })

  socket.on('subscribe:thread', ({ threadId } = {}) => {
    const room = `${companyRoom}:thread:${threadId}`
    if (threadId && roomAllowed(socket, room)) socket.join(room)
  })

  socket.on('typing', ({ threadId, isTyping } = {}) => {
    const room = `${companyRoom}:thread:${threadId}`
    if (!threadId || !roomAllowed(socket, room)) return
    socket.to(room).emit('typing:update', {
      threadId,
      userId: claims.sub,
      isTyping: Boolean(isTyping),
    })
  })

  socket.on('disconnect', () => {
    const offline = setPresence(claims.sub, socket.id, false)
    if (offline) io.to(companyRoom).emit('presence:update', { userId: claims.sub, online: false })
  })
})

async function connectRedis() {
  const pub = createClient({ url: config.redisUrl })
  const sub = pub.duplicate()
  const stream = createClient({ url: config.redisUrl })
  for (const client of [pub, sub, stream]) {
    client.on('error', (error) => console.error('Realtime Redis error:', error.message))
  }
  const settled = await Promise.allSettled([pub.connect(), sub.connect(), stream.connect()])
  if (settled.every((result) => result.status === 'fulfilled')) {
    io.adapter(createAdapter(pub, sub))
    console.log('Realtime Redis adapter enabled')
    await startEventRelay(io, stream)
  } else {
    console.warn('Realtime Redis unavailable; using in-process adapter and polling fallback')
  }
}

connectRedis().catch((error) => {
  console.error('Realtime startup warning:', error.message)
})

httpServer.listen(config.port, () => {
  console.log(`Comet realtime listening on http://localhost:${config.port}`)
})

export default io
