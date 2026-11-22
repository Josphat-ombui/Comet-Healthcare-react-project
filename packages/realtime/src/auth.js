// Socket.IO authentication. The token is short-lived, scope-limited and
// contains only opaque IDs. Room claims are computed by the messaging API.

import jwt from 'jsonwebtoken'
import { config } from './config.js'

export function verifyRealtimeToken(token) {
  const payload = jwt.verify(token, config.jwtSecret)
  if (payload.scope !== 'realtime') throw new Error('Invalid token scope')
  if (!payload.companyId || !payload.sub || !Array.isArray(payload.rooms)) {
    throw new Error('Invalid realtime token claims')
  }
  if (!payload.rooms.every((room) => typeof room === 'string' && room.startsWith(`company:${payload.companyId}`))) {
    throw new Error('Room claim is outside the token tenant')
  }
  return payload
}

export function extractToken(socket) {
  const fromAuth = socket.handshake.auth?.token
  if (fromAuth) return fromAuth
  const header = socket.handshake.headers?.authorization || ''
  return header.startsWith('Bearer ') ? header.slice(7) : null
}

export function roomAllowed(socket, room) {
  return Boolean(socket.data.claims?.rooms?.includes(room))
}
