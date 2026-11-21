import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  timeToMinutes,
  minutesToTime,
  generateSlots,
  hasConflict,
  addDays,
  localIsoDay,
  isValidIsoDate,
  isPastDate,
} from '../lib/slots.js'

test('timeToMinutes / minutesToTime round-trip', () => {
  assert.equal(timeToMinutes('09:00'), 540)
  assert.equal(timeToMinutes('09:05'), 545)
  assert.equal(timeToMinutes('invalid'), null)
  assert.equal(minutesToTime(540), '09:00')
  assert.equal(minutesToTime(545), '09:05')
  assert.equal(minutesToTime(0), '00:00')
  assert.equal(minutesToTime(1439), '23:59')
})

test('hasConflict detects partial and full overlap only', () => {
  const busy = [{ start: 600, end: 660 }] // 10:00-11:00
  assert.equal(hasConflict(busy, 540, 600), false) // 09:00-10:00 adjacent
  assert.equal(hasConflict(busy, 650, 700), true) // 10:50-11:40 overlaps
  assert.ok(!hasConflict([], 540, 600))
})

const schedule = { startTime: '09:00', endTime: '17:00', slotMinutes: 30 }

test('generateSlots produces full day of 30-min slots (16 slots)', () => {
  const slots = generateSlots({ schedule, date: '2026-09-14', existing: [] })
  assert.equal(slots.length, 16)
  assert.equal(slots[0].start, '09:00')
  assert.equal(slots[0].end, '09:30')
  assert.equal(slots[15].start, '16:30')
  assert.ok(slots.every((s) => s.available))
})

test('booked slot marks only the overlapping window unavailable', () => {
  const existing = [{ startTime: '10:00', endTime: '11:00', status: 'CONFIRMED' }]
  const slots = generateSlots({ schedule, date: '2026-09-15', existing })
  const byStart = Object.fromEntries(slots.map((s) => [s.start, s.available]))
  assert.equal(byStart['10:00'], false)
  assert.equal(byStart['10:30'], false)
  assert.equal(byStart['09:30'], true)
  assert.equal(byStart['11:00'], true)
})

test('cancelled/completed appointments release the slot', () => {
  const existing = [{ startTime: '10:00', endTime: '11:00', status: 'CANCELLED' }]
  const slots = generateSlots({ schedule, date: '2026-09-16', existing })
  const byStart = Object.fromEntries(slots.map((s) => [s.start, s.available]))
  assert.equal(byStart['10:00'], true)
})

test('past slots on today are not offered', () => {
  const now = new Date(2026, 8, 14, 10, 5) // 2026-09-14 10:05
  const slots = generateSlots({ schedule, date: '2026-09-14', existing: [], now })
  assert.equal(slots[0].start, '09:00')
  assert.equal(slots[0].available, false)
  const firstAvailable = slots.find((s) => s.available)
  assert.equal(firstAvailable.start, '10:30') // 10:00-10:30 slot in progress at 10:05
})

test('invalid schedule produces no slots', () => {
  assert.equal(generateSlots({ schedule: { startTime: '17:00', endTime: '09:00', slotMinutes: 30 }, date: '2026-09-14', existing: [] }).length, 0)
  assert.equal(generateSlots({ schedule: { startTime: 'abc', endTime: '09:00', slotMinutes: 30 }, date: '2026-09-14', existing: [] }).length, 0)
})

test('date helpers', () => {
  assert.equal(addDays('2026-09-14', 1), '2026-09-15')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.ok(isValidIsoDate('2026-09-14'))
  assert.ok(!isValidIsoDate('2026-13-40'))
  assert.ok(!isValidIsoDate('2026-9-14'))
  assert.ok(isPastDate('2020-01-01'))
  assert.ok(!isPastDate('2099-01-01'))
  const d = new Date(2026, 8, 14, 12)
  assert.equal(localIsoDay(d), '2026-09-14')
})