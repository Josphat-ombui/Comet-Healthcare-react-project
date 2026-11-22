-- The identity migration added Role enum values to schema.prisma but Prisma
-- does not emit ALTER TYPE for enums in hand-written migrations. Apply them
-- explicitly before seeding role-based accounts.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'STAFF';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MANAGER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'COMPLIANCE';
