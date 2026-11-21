import { PrismaClient } from '@prisma/client'

// Single shared Prisma client for the whole server.
// Reusing one connection pool is important in dev (--watch restarts aside).
export const prisma = new PrismaClient()