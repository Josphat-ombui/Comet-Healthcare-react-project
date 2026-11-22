import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  CalendarDays, CalendarCheck2, LogOut, Mail, Shield, Users, Inbox,
  Search, XCircle, CheckCircle2, Flame,
} from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Badge, { APPOINTMENT_TONE, INQUIRY_TONE } from '../../components/ui/Badge.jsx'
import { Spinner } from '../../components/ui/Alert.jsx'
import { SkeletonBlock } from '../../components/ui/SmartImage.jsx'
import { prettyDate, addDays, localIsoDay } from '../../lib/dates.js'
import ContentStudio from './ContentStudio.jsx'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const fmtDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return { weekday: WEEKDAYS[date.getDay()], day: d, month: date.toLocaleString('en', { month: 'short' }) }
}

function PortalHeader({ title, subtitle, user, onLogout }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-primary text-white flex items-center justify-center font-heading text-xl font-bold">
          {user.firstName?.[0] || 'C'}
        </div>
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-ink leading-tight">{title}</h1>
          <p className="text-sm text-slate">{subtitle}</p>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onLogout}>
        <LogOut size={15} aria-hidden="true" /> Sign out
      </Button>
    </div>
  )
}

/* ============================================================ CLIENT VIEW */

function ClientDashboard() {
  const { user, logout } = useAuth()
  const { push } = useToast()
  const [appointments, setAppointments] = useState([])
  const [inquiries, setInquiries] = useState([])
  const [loading, setLoading] = useState(true)
  const [rescheduleFor, setRescheduleFor] = useState(null)
  const [cancelFor, setCancelFor] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [appts, leads] = await Promise.all([
        api.get('/appointments/mine'),
        api.get('/inquiries?mine=1'),
      ])
      setAppointments(appts.items)
      setInquiries(leads.items || [])
    } catch (err) {
      push(err.message || 'Could not load your dashboard', 'error')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const upcoming = useMemo(
    () => appointments.filter((a) => a.status === 'SCHEDULED' || a.status === 'CONFIRMED'),
    [appointments]
  )
  const past = useMemo(
    () => appointments.filter((a) => a.status === 'COMPLETED' || a.status === 'CANCELLED'),
    [appointments]
  )

  async function cancelBooking(code) {
    try {
      await api.patch(`/appointments/${code}`, { action: 'cancel' })
      push('Consultation cancelled', 'info')
      setCancelFor(null)
      load()
    } catch (err) {
      push(err.message, 'error')
    }
  }

  async function rescheduleBooking(code, date, startTime) {
    try {
      await api.patch(`/appointments/${code}`, { date, startTime })
      push('Consultation rescheduled', 'success')
      setRescheduleFor(null)
      load()
    } catch (err) {
      push(err.message || 'Could not reschedule', 'error')
    }
  }

  return (
    <section className="min-h-[70vh] bg-cream py-14 lg:py-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <PortalHeader
          title="Client portal"
          subtitle={`Welcome back, ${user.firstName}`} 
          user={user}
          onLogout={logout}
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="card p-5">
            <CalendarDays size={18} className="text-primary" aria-hidden="true" />
            <div className="text-2xl font-bold font-heading text-ink mt-2">{upcoming.length}</div>
            <div className="text-xs text-slate uppercase tracking-wide">Upcoming</div>
          </div>
          <div className="card p-5">
            <CalendarCheck2 size={18} className="text-primary" aria-hidden="true" />
            <div className="text-2xl font-bold font-heading text-ink mt-2">{appointments.length}</div>
            <div className="text-xs text-slate uppercase tracking-wide">Total bookings</div>
          </div>
          <div className="card p-5">
            <Inbox size={18} className="text-secondary-dark" aria-hidden="true" />
            <div className="text-2xl font-bold font-heading text-ink mt-2">{inquiries.filter((i) => i.status === 'NEW').length}</div>
            <div className="text-xs text-slate uppercase tracking-wide">Open inquiries</div>
          </div>
          <div className="card p-5">
            <Users size={18} className="text-primary" aria-hidden="true" />
            <div className="text-2xl font-bold font-heading text-ink mt-2 truncate">{user.company || '—'}</div>
            <div className="text-xs text-slate uppercase tracking-wide">Company</div>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4">
            <SkeletonBlock className="h-16 w-full" />
            <SkeletonBlock className="h-16 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="card p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-heading text-lg font-semibold text-ink">Upcoming consultations</h2>
                <Link to="/book" className="text-sm font-semibold text-primary hover:underline">Book new</Link>
              </div>
              {upcoming.length === 0 ? (
                <p className="text-sm text-slate py-4">No upcoming consultations. <Link to="/book" className="text-primary font-semibold hover:underline">Book one now</Link>.</p>
              ) : (
                <div>
                  {upcoming.map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5 border-b border-mist/70 last:border-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 shrink-0 rounded-xl bg-primary-50 flex items-center justify-center">
                          <CalendarCheck2 size={18} className="text-primary" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink truncate">{a.provider?.name} · {a.code}</p>
                          <p className="text-xs text-slate truncate">{prettyDate(a.date)} · {a.startTime}–{a.endTime} · {a.type}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge tone={APPOINTMENT_TONE[a.status]}>{a.status}</Badge>
                        <Button variant="outline" size="sm" onClick={() => setRescheduleFor(a)}>Reschedule</Button>
                        <Button variant="ghost" size="sm" onClick={() => setCancelFor(a)}>Cancel</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <div className="card p-6">
                <h2 className="font-heading text-lg font-semibold text-ink mb-3">Past & cancelled</h2>
                {past.length === 0 ? <p className="text-sm text-slate py-3">Nothing here yet.</p> : past.map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-3 border-b border-mist/70 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{a.provider?.name}</p>
                      <p className="text-xs text-slate">{prettyDate(a.date)} · {a.startTime}</p>
                    </div>
                    <Badge tone={APPOINTMENT_TONE[a.status]}>{a.status}</Badge>
                  </div>
                ))}
              </div>
              <div className="card p-6">
                <h2 className="font-heading text-lg font-semibold text-ink mb-3">Your inquiries</h2>
                {inquiries.length === 0 ? (
                  <p className="text-sm text-slate py-3">No inquiries yet — <Link to="/contact" className="text-primary font-semibold hover:underline">send one here</Link>.</p>
                ) : (
                  inquiries.map((i) => (
                    <div key={i.id} className="py-3.5 border-b border-mist/70 last:border-0">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-ink">{i.subject || i.kind.toLowerCase()}</span>
                        <Badge tone={INQUIRY_TONE[i.status]}>{i.status}</Badge>
                      </div>
                      <p className="text-xs text-slate mt-1 line-clamp-2">{i.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <CancelModal appointment={cancelFor} onClose={() => setCancelFor(null)} onConfirm={() => cancelBooking(cancelFor.code)} />
      {rescheduleFor && (
        <RescheduleModal appointment={rescheduleFor} onClose={() => setRescheduleFor(null)} onConfirm={(d, t) => rescheduleBooking(rescheduleFor.code, d, t)} />
      )}
    </section>
  )
}

function CancelModal({ appointment, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      open={!!appointment}
      onClose={onClose}
      title="Cancel this consultation?"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Keep booking</Button>
          <Button variant="danger" loading={busy} onClick={async () => { setBusy(true); onConfirm() }}>
            <XCircle size={15} aria-hidden="true" /> Cancel booking
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate leading-relaxed">
        {appointment && (
          <>
            Booking <strong className="text-ink">{appointment.code}</strong> with{' '}
            <strong className="text-ink">{appointment.provider?.name}</strong> on{' '}
            <strong className="text-ink">{prettyDate(appointment.date)} at {appointment.startTime}</strong>.
            This step can't be undone.
          </>
        )}
      </p>
    </Modal>
  )
}

function RescheduleModal({ appointment, onClose, onConfirm }) {
  const [slots, setSlots] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState({ date: '', time: '' })
  const [error, setError] = useState('')
  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(localIsoDay(), i)), [])

  useEffect(() => {
    if (!appointment) return
    let active = true
    setLoading(true)
    Promise.all(
      dates.map(async (date) => {
        const res = await api.get(`/providers/${appointment.provider?.slug}/slots?date=${date}`)
        return [date, res.slots]
      })
    )
      .then((entries) => {
        if (!active) return
        const map = Object.fromEntries(entries)
        setSlots(map)
        const first = dates.find((d) => map[d].some((s) => s.available))
        if (first) setSelected((s) => ({ ...s, date: first }))
        setError('')
      })
      .catch(() => setError('Could not load availability'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment])

  return (
    <Modal open={!!appointment} onClose={onClose} title={`Reschedule ${appointment?.code ?? ''}`}>
      {error && <p className="text-sm text-danger mb-4">{error}</p>}

      <div className="flex gap-2 overflow-x-auto pb-2 mb-5" role="list" aria-label="Pick a new date">
        {dates.map((date) => {
          const avail = slots?.[date]?.filter((s) => s.available).length || 0
          const label = fmtDay(date)
          const active = selected.date === date
          return (
            <button
              key={date}
              type="button"
              disabled={!avail}
              aria-pressed={active}
              aria-label={`${label.weekday} ${label.month} ${label.day}`}
              onClick={() => setSelected({ date, time: '' })}
              className={`flex flex-col items-center w-16 shrink-0 rounded-xl border py-2.5 transition-all ${
                !avail ? 'border-mist/60 bg-cream/70 text-slate/40 cursor-not-allowed'
                  : active ? 'border-primary bg-primary text-white'
                    : 'border-mist bg-white hover:border-primary cursor-pointer'
              }`}
            >
              <span className="text-[10px] uppercase">{label.weekday}</span>
              <span className="text-lg font-bold font-heading">{label.day}</span>
              <span className="text-[10px]">{label.month}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <Spinner label="Loading availability…" />
      ) : selected.date ? (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {(slots?.[selected.date] || [])
            .filter((s) => s.available)
            .map((slot) => (
              <button
                key={slot.start}
                type="button"
                aria-pressed={selected.time === slot.start}
                onClick={() => setSelected((s) => ({ ...s, time: slot.start }))}
                className={`slot-btn ${selected.time === slot.start ? 'slot-sel' : 'slot-avail'}`}
              >
                {slot.start}
              </button>
            ))}
        </div>
      ) : null}

      <div className="flex justify-end gap-3 mt-6 border-t border-mist pt-5">
        <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button onClick={() => selected.time && onConfirm(selected.date, selected.time)} disabled={!selected.time || loading} loading={loading}>
          <CheckCircle2 size={15} aria-hidden="true" /> Confirm new time
        </Button>
      </div>
    </Modal>
  )
}

/* ============================================================= ADMIN VIEW */

const APP_STATUSES = ['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED']
const INQ_STATUSES = ['NEW', 'REVIEWED', 'ARCHIVED']

function AdminDashboard() {
  const { user, logout } = useAuth()
  const { push } = useToast()
  const [stats, setStats] = useState(null)
  const [appointments, setAppointments] = useState([])
  const [apptFilter, setApptFilter] = useState('')
  const [apptQuery, setApptQuery] = useState('')
  const [inquiries, setInquiries] = useState([])
  const [inquiryFilter, setInquiryFilter] = useState('')
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)

  const loadStats = useCallback(() => api.get('/admin/stats').then(setStats), [])
  const loadAppointments = useCallback((status, q) => {
    const p = new URLSearchParams()
    if (status) p.set('status', status)
    if (q && q.trim()) p.set('q', q.trim())
    return api.get(`/admin/appointments?${p.toString()}`).then((res) => setAppointments(res.items))
  }, [])
  const loadInquiries = useCallback((status) => {
    const p = new URLSearchParams()
    if (status) p.set('status', status)
    return api.get(`/admin/inquiries?${p.toString()}`).then((res) => setInquiries(res.items))
  }, [])

  useEffect(() => {
    Promise.allSettled([loadStats(), loadAppointments('', ''), loadInquiries('')]).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function changeApptStatus(id, status) {
    try {
      await api.patch(`/admin/appointments/${id}`, { status })
      push(`Booking marked ${status}`, 'success')
      await Promise.allSettled([loadStats(), loadAppointments(apptFilter, apptQuery)])
    } catch (err) {
      push(err.message, 'error')
    }
  }

  async function changeInquiryStatus(id, status) {
    try {
      await api.patch(`/admin/inquiries/${id}`, { status })
      push(`Inquiry marked ${status}`, 'success')
      await Promise.allSettled([loadStats(), loadInquiries(inquiryFilter)])
    } catch (err) {
      push(err.message, 'error')
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spinner label="Loading dashboard…" />
      </div>
    )
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Flame },
    { id: 'appointments', label: 'Appointments', icon: CalendarDays },
    { id: 'inquiries', label: 'Inquiries', icon: Mail },
    { id: 'content', label: 'Content studio', icon: Shield },
  ]

  const statusButtons = (active, onPick, statuses) => (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" className={!active ? 'border-primary text-primary bg-primary-50' : ''} onClick={() => onPick('')}>
        All
      </Button>
      {statuses.map((s) => (
        <Button key={s} variant="outline" size="sm" className={active === s ? 'border-primary text-primary bg-primary-50' : ''} onClick={() => onPick(s)}>
          {s}
        </Button>
      ))}
    </div>
  )

  return (
    <section className="min-h-[70vh] bg-cream py-14 lg:py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <PortalHeader title="Admin dashboard" subtitle="Manage consultations, leads and operations" user={user} onLogout={logout} />

        <div className="flex gap-1.5 bg-white border border-mist rounded-xl p-1.5 mb-8 w-fit" role="tablist" aria-label="Admin sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                tab === t.id ? 'bg-primary text-white' : 'text-slate hover:text-primary'
              }`}
            >
              <t.icon size={15} aria-hidden="true" /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="card p-5"><CalendarDays size={18} className="text-primary" aria-hidden="true" /><div className="text-2xl font-bold font-heading text-ink mt-2">{stats.totals.appointments}</div><div className="text-xs text-slate uppercase tracking-wide">Total bookings</div></div>
              <div className="card p-5"><Inbox size={18} className="text-secondary-dark" aria-hidden="true" /><div className="text-2xl font-bold font-heading text-ink mt-2">{stats.inquiriesByStatus.NEW || 0}</div><div className="text-xs text-slate uppercase tracking-wide">Open leads</div></div>
              <div className="card p-5"><Users size={18} className="text-primary" aria-hidden="true" /><div className="text-2xl font-bold font-heading text-ink mt-2">{stats.totals.users}</div><div className="text-xs text-slate uppercase tracking-wide">Client accounts</div></div>
              <div className="card p-5"><Shield size={18} className="text-primary" aria-hidden="true" /><div className="text-2xl font-bold font-heading text-ink mt-2">{stats.totals.providers}</div><div className="text-xs text-slate uppercase tracking-wide">Active experts</div></div>
            </div>

            <div className="card p-6 mb-6">
              <h2 className="font-heading text-lg font-semibold text-ink mb-4">Bookings by status</h2>
              <div className="grid sm:grid-cols-4 gap-4">
                {APP_STATUSES.map((s) => (
                  <div key={s} className="rounded-xl bg-cream p-4">
                    <div className="text-2xl font-bold font-heading text-ink">{stats.appointmentsByStatus[s] || 0}</div>
                    <div className="text-xs text-slate uppercase tracking-wide mt-0.5">{s.toLowerCase()}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-heading text-lg font-semibold text-ink">Next consultations</h2>
                <Link to="/book" className="text-sm font-semibold text-primary hover:underline">Book on behalf</Link>
              </div>
              {stats.upcoming.length === 0 ? (
                <p className="text-sm text-slate py-2">No upcoming consultations.</p>
              ) : (
                stats.upcoming.map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-3 border-b border-mist/70 last:border-0">
                    <div>
                      <p className="text-sm font-semibold text-ink">{a.patientName} · {a.code}</p>
                      <p className="text-xs text-slate">{prettyDate(a.date)} · {a.startTime}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setTab('appointments')}>View</Button>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {tab === 'appointments' && (
          <div className="card overflow-hidden">
            <div className="p-5 border-b border-mist space-y-4">
              <div className="relative w-full sm:w-72">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate" aria-hidden="true" />
                <input
                  className="input pl-10"
                  placeholder="Search name, email, reference…"
                  value={apptQuery}
                  onChange={(e) => { const v = e.target.value; setApptQuery(v); loadAppointments(apptFilter, v) }}
                  aria-label="Search appointments"
                />
              </div>
              {statusButtons(apptFilter, (s) => { setApptFilter(s); loadAppointments(s, apptQuery) }, APP_STATUSES)}
            </div>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Expert</th>
                    <th>When</th>
                    <th>Status</th>
                    <th><span className="sr-only">Change status</span></th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.length === 0 && (
                    <tr><td colSpan={5} className="text-center text-slate py-8">No appointments found.</td></tr>
                  )}
                  {appointments.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <p className="font-semibold text-ink">{a.patientName}</p>
                        <p className="text-xs text-slate">{a.patientEmail}{a.company ? ` · ${a.company}` : ''}</p>
                      </td>
                      <td>
                        <p className="text-ink">{a.provider?.name || '—'}</p>
                        <p className="text-xs text-slate">{a.provider?.specialty}</p>
                      </td>
                      <td>
                        <p className="text-ink">{prettyDate(a.date)}</p>
                        <p className="text-xs text-slate">{a.startTime}–{a.endTime}</p>
                      </td>
                      <td><Badge tone={APPOINTMENT_TONE[a.status]}>{a.status}</Badge></td>
                      <td>
                        <select
                          aria-label={`Change status for booking ${a.code}`}
                          className="select py-1.5 px-3 text-xs"
                          value={a.status}
                          onChange={(e) => changeApptStatus(a.id, e.target.value)}
                        >
                          {APP_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'content' && <ContentStudio />}

        {tab === 'inquiries' && (
          <div className="card overflow-hidden">
            <div className="p-5 border-b border-mist">
              {statusButtons(inquiryFilter, (s) => { setInquiryFilter(s); loadInquiries(s) }, INQ_STATUSES)}
            </div>
            <div className="divide-y divide-mist/70">
              {inquiries.length === 0 && <p className="text-center text-slate py-10">No inquiries found.</p>}
              {inquiries.map((i) => (
                <div key={i.id} className="p-5">
                  <div className="flex flex-wrap items-center gap-3 justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {i.name}{i.company ? ` · ${i.company}` : ''} <span className="text-slate font-normal">— {i.kind.toLowerCase()}</span>
                      </p>
                      <p className="text-xs text-slate">{i.email}{i.phone ? ` · ${i.phone}` : ''} · {new Date(i.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={INQUIRY_TONE[i.status]}>{i.status}</Badge>
                      <select
                        aria-label={`Change status for inquiry from ${i.name}`}
                        className="select py-1.5 px-3 text-xs"
                        value={i.status}
                        onChange={(e) => changeInquiryStatus(i.id, e.target.value)}
                      >
                        {INQ_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  {i.subject && <p className="text-sm font-semibold text-ink mt-2">{i.subject}</p>}
                  <p className="text-sm text-slate mt-1 leading-relaxed">{i.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/* ============================================================== ROUTER */

export default function Portal({ view }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spinner label="Checking your session…" />
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  if (view === 'admin' && user.role !== 'ADMIN') {
    return <Navigate to="/portal" replace />
  }
  if (view === 'admin') {
    return <AdminDashboard key={user.id} />
  }
  return <ClientDashboard key={user.id} />
}