import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ShieldCheck, ArrowRight, MailCheck, KeyRound } from 'lucide-react'
import { api, fieldErrorsFrom } from '../../lib/api.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { Field, Input } from '../../components/ui/Field.jsx'
import Button from '../../components/ui/Button.jsx'
import Alert from '../../components/ui/Alert.jsx'

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <section className="py-16 lg:py-24 bg-cream min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-md mx-auto px-4">
        <div className="card p-8">
          <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center mb-5">
            <ShieldCheck size={24} className="text-primary" aria-hidden="true" />
          </div>
          <h1 className="font-heading text-2xl font-bold text-ink mb-1.5">{title}</h1>
          <p className="text-sm text-slate mb-6">{subtitle}</p>
          {children}
        </div>
        {footer && <p className="text-center text-sm text-slate mt-6">{footer}</p>}
      </div>
    </section>
  )
}

export default function AuthPages({ mode }) {
  const { login, register, user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  // Already signed in → straight to portal.
  useEffect(() => {
    if (user) navigate(user.role === 'ADMIN' ? '/portal/admin' : '/portal', { replace: true })
  }, [user, navigate])

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    company: '',
    phone: '',
    email: '',
    password: '',
    confirm: '',
  })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  if (user) return null

  function applyError(err) {
    const fieldMap = fieldErrorsFrom(err.data || {})
    if (Object.keys(fieldMap).length) setFieldErrors(fieldMap)
    setError(err.message)
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    setSubmitting(true)
    try {
      if (mode === 'login') {
        const me = await login(form.email, form.password)
        navigate(me.role === 'ADMIN' ? '/portal/admin' : '/portal', { replace: true })
      } else if (mode === 'register') {
        if (form.password !== form.confirm) {
          setFieldErrors({ confirm: 'Passwords do not match' })
          setError('')
          setSubmitting(false)
          return
        }
        await register({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          password: form.password,
          company: form.company,
          phone: form.phone,
        })
        navigate('/portal', { replace: true })
      } else if (mode === 'forgot') {
        await api.post('/auth/forgot-password', { email: form.email })
        setInfo('If that email is registered, a reset link is on its way.')
      } else if (mode === 'reset') {
        const token = params.get('token')
        if (!token) {
          setError('This reset link is missing its token. Please request a new one.')
          setSubmitting(false)
          return
        }
        if (form.password !== form.confirm) {
          setFieldErrors({ confirm: 'Passwords do not match' })
          setError('')
          setSubmitting(false)
          return
        }
        await api.post('/auth/reset-password', { token, password: form.password })
        setInfo('Password updated. You can now sign in.')
        setForm((f) => ({ ...f, password: '', confirm: '' }))
      }
    } catch (err) {
      applyError(err)
    } finally {
      setSubmitting(false)
    }
  }

  if (mode === 'forgot') {
    return (
      <AuthShell title="Reset your password" subtitle="Enter the email on your Comet Healthcare account.">
        {info && <div className="mb-5"><Alert type="success"><span className="inline-flex items-center gap-2"><MailCheck size={16} aria-hidden="true" /> {info}</span></Alert></div>}
        {error && !info && <div className="mb-5"><Alert type="error">{error}</Alert></div>}
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Email address" htmlFor="fg-email" required>
            <Input id="fg-email" type="email" required value={form.email} onChange={setField('email')} placeholder="you@company.com" autoComplete="email" />
          </Field>
          <Button type="submit" block loading={submitting}>
            Send reset link <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </form>
        <div className="footer">
          <Link to="/login" className="text-primary font-semibold hover:underline">Back to sign in</Link>
        </div>
      </AuthShell>
    )
  }

  if (mode === 'reset') {
    return (
      <AuthShell title="Choose a new password" subtitle="Make it at least 8 characters — you'll use it to sign in.">
        {info ? (
          <div className="space-y-5">
            <Alert type="success"><span className="inline-flex items-center gap-2"><KeyRound size={16} aria-hidden="true" /> {info}</span></Alert>
            <Button to="/login" block>Go to sign in</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            {error && <Alert type="error">{error}</Alert>}
            <Field label="New password" htmlFor="rs-pass" required>
              <Input id="rs-pass" type="password" required value={form.password} onChange={setField('password')} placeholder="At least 8 characters" autoComplete="new-password" />
            </Field>
            <Field label="Confirm password" htmlFor="rs-pass2" error={fieldErrors.confirm} required>
              <Input id="rs-pass2" type="password" required invalid={!!fieldErrors.confirm} value={form.confirm} onChange={setField('confirm')} placeholder="Repeat password" autoComplete="new-password" />
            </Field>
            <Button type="submit" block loading={submitting}>Set new password</Button>
          </form>
        )}
      </AuthShell>
    )
  }

  const isLogin = mode === 'login'
  return (
    <AuthShell
      title={isLogin ? 'Welcome back' : 'Create a client account'}
      subtitle={
        isLogin
          ? 'Access your consultations, inquiries and bookings.'
          : 'Track consultations and inquiries in one place — free for partners.'
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert type="error">{error}</Alert>}
        {!isLogin && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field label="First name" htmlFor="a-first" error={fieldErrors.firstName} required>
                <Input id="a-first" required invalid={!!fieldErrors.firstName} value={form.firstName} onChange={setField('firstName')} placeholder="Jane" autoComplete="given-name" />
              </Field>
              <Field label="Last name" htmlFor="a-last" error={fieldErrors.lastName} required>
                <Input id="a-last" required invalid={!!fieldErrors.lastName} value={form.lastName} onChange={setField('lastName')} placeholder="Doe" autoComplete="family-name" />
              </Field>
            </div>
            <Field label="Company / organisation" htmlFor="a-company">
              <Input id="a-company" value={form.company} onChange={setField('company')} placeholder="Acme Pharma Ltd" autoComplete="organization" />
            </Field>
          </>
        )}
        <Field label="Email address" htmlFor="a-email" error={fieldErrors.email} required>
          <Input id="a-email" type="email" required invalid={!!fieldErrors.email} value={form.email} onChange={setField('email')} placeholder="you@company.com" autoComplete="email" />
        </Field>
        {!isLogin && (
          <Field label="Phone" htmlFor="a-phone">
            <Input id="a-phone" type="tel" value={form.phone} onChange={setField('phone')} placeholder="+254 7xx xxx xxx" autoComplete="tel" />
          </Field>
        )}
        <Field label="Password" htmlFor="a-pass" error={fieldErrors.password} hint={isLogin ? undefined : 'At least 8 characters.'} required>
          <Input id="a-pass" type="password" required invalid={!!fieldErrors.password} value={form.password} onChange={setField('password')} placeholder="••••••••" autoComplete={isLogin ? 'current-password' : 'new-password'} />
        </Field>
        {!isLogin && (
          <Field label="Confirm password" htmlFor="a-conf" error={fieldErrors.confirm} required>
            <Input id="a-conf" type="password" required invalid={!!fieldErrors.confirm} value={form.confirm} onChange={setField('confirm')} placeholder="Repeat password" autoComplete="new-password" />
          </Field>
        )}
        {isLogin && (
          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-xs font-semibold text-primary hover:underline">Forgot password?</Link>
          </div>
        )}
        <Button type="submit" block loading={submitting}>
          {isLogin ? 'Sign in' : 'Create account'} <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </form>
      <div className="flex items-center justify-center gap-1.5 mt-6 text-sm text-slate">
        {isLogin ? (
          <>
            New partner? <Link to="/register" className="font-semibold text-primary hover:underline">Create an account</Link>
          </>
        ) : (
          <>
            Already registered? <Link to="/login" className="font-semibold text-primary hover:underline">Sign in</Link>
          </>
        )}
      </div>
    </AuthShell>
  )
}