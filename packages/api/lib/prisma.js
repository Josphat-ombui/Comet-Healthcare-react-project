import './env.js'
import { PrismaClient } from '@prisma/client'

// Migrations/seeds use DATABASE_URL (owner). The runtime uses DATABASE_URL_APP
// (non-owner) when set so PostgreSQL RLS is actually enforced.
const url = process.env.DATABASE_URL_APP || process.env.DATABASE_URL

export const prisma = new PrismaClient(url ? { datasources: { db: { url } } } : undefined)
