import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone, Mail, MapPin, Clock, MessageCircle, Send, CheckCircle2 } from 'lucide-react'
import PageHero from '../components/PageHero.jsx'
import SectionReveal from '../components/SectionReveal.jsx'
import { Field, Input, Textarea, Select } from '../components/ui/Field.jsx'
import Button from '../components/ui/Button.jsx'
import Alert from '../components/ui/Alert.jsx'
import { api, fieldErrorsFrom } from '../lib/api.js'
import { Icon } from '../lib/icons.jsx'
import { useContent } from '../context/ContentContext.jsx'

const FALLBACK_HERO = {
  eyebrow: 'Get in Touch',
  title: 'Contact Comet Healthcare',
  lead: 'Product inquiries, CDMO partnerships, catalogue requests or support — our team is ready with reliable answers.',
}

const FALLBACK_LOCATIONS = [
  { icon: 'map', place: 'Head office & plant', detail: 'Mua-Kitanga Road, off Mombasa Road, Machakos, Kenya' },
  { icon: 'mail', place: 'Commercial & regulatory', detail: 'P.O. BOX 6293, Nairobi, Kenya 00300' },
  { icon: 'clock', place: 'Service hours (all sites)', detail: 'Mon–Fri 8:00am–5:00pm · Sat 8:30am–3:00pm' },
]

const contactInfo = [
  {
    icon: MapPin,
    title: 'Visit Us',
    lines: ['Mua-Kitanga Road, off Mombasa Road', 'Machakos, Kenya', 'P.O. BOX 6293, Nairobi 00300'],
  },
  {
    icon: Phone,
    title: 'Call Us',
    lines: ['+254 725 519 844'],
    href: 'tel:+254725519844',
  },
  {
    icon: Mail,
    title: 'Email Us',
    lines: ['info@comethealthcares.com'],
    href: 'mailto:info@comethealthcares.com',
  },
  {
    icon: Clock,
    title: 'Working Hours',
    lines: ['Mon–Fri: 8:00am – 5:00pm', 'Sat: 8:30am – 3:00pm', 'Sun: Closed'],
  },
]

const INITIAL = { kind: 'CONTACT', name: '', company: '', email: '', phone: '', subject: '', message: '' }

function InquiryForm() {
  const [form, setForm] = useState(INITIAL)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    setSubmitting(true)
    try {
      const res = await api.post('/inquiries', form)
      setSuccess(res)
      setForm(INITIAL)
    } catch (err) {
      const fieldMap = fieldErrorsFrom(err.data || {})
      if (Object.keys(fieldMap).length) setFieldErrors(fieldMap)
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="bg-white rounded-2xl shadow-card border border-mist p-10 lg:p-12 text-center">
        <div className="w-16 h-16 mx-auto bg-success-light rounded-full flex items-center justify-center mb-5 animate-toast-in">
          <CheckCircle2 size={32} className="text-success" aria-hidden="true" />
        </div>
        <h2 className="font-heading text-2xl font-bold text-ink mb-2">Message received</h2>
        <p className="text-slate leading-relaxed max-w-md mx-auto">
          Thanks — a member of our team will respond within one business day. Reference{' '}
          <strong className="text-ink">{success.id}</strong>.
        </p>
        <Button variant="outline" size="sm" className="mt-6" onClick={() => setSuccess(null)}>
          Send another message
        </Button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-card border border-mist p-8 lg:p-10">
      <h2 className="font-heading text-2xl font-bold text-ink mb-2">Send us a message</h2>
      <p className="text-slate text-sm mb-8">Fill in the form and we'll get back to you within 24 hours — or book an expert directly.</p>
      <form className="space-y-5" onSubmit={submit} noValidate>
        {error && <Alert type="error">{error}</Alert>}
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Full name" htmlFor="c-name" error={fieldErrors.name} required>
            <Input id="c-name" required invalid={!!fieldErrors.name} value={form.name} onChange={setField('name')} placeholder="Your name" autoComplete="name" />
          </Field>
          <Field label="Company / organisation" htmlFor="c-company">
            <Input id="c-company" value={form.company} onChange={setField('company')} placeholder="Optional" autoComplete="organization" />
          </Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Email address" htmlFor="c-email" error={fieldErrors.email} required>
            <Input id="c-email" type="email" required invalid={!!fieldErrors.email} value={form.email} onChange={setField('email')} placeholder="you@example.com" autoComplete="email" />
          </Field>
          <Field label="Phone number" htmlFor="c-phone">
            <Input id="c-phone" type="tel" value={form.phone} onChange={setField('phone')} placeholder="+254 7xx xxx xxx" autoComplete="tel" />
          </Field>
        </div>
        <Field label="Topic" htmlFor="c-kind">
          <Select id="c-kind" value={form.kind} onChange={setField('kind')}>
            <option value="CONTACT">General inquiry</option>
            <option value="CDMO">CDMO / contract manufacturing</option>
            <option value="CATALOG">Product catalogue & pricing</option>
          </Select>
        </Field>
        <Field label="Subject" htmlFor="c-subject">
          <Input id="c-subject" value={form.subject} onChange={setField('subject')} placeholder="What's this about?" />
        </Field>
        <Field label="Message" htmlFor="c-msg" error={fieldErrors.message} required>
          <Textarea id="c-msg" rows={5} required invalid={!!fieldErrors.message} value={form.message} onChange={setField('message')} placeholder="How can we help you? Be specific — it helps us route you to the right expert." />
        </Field>
        <Button type="submit" size="md" loading={submitting}>
          Send Message <Send size={16} aria-hidden="true" />
        </Button>
        <p className="text-xs text-slate mt-3">
          Prefer to talk? <a href="https://wa.me/254725519844" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">WhatsApp us</a> or{' '}
          <Link to="/book" className="font-semibold text-primary hover:underline">book a consultation</Link> for a scheduled call.
        </p>
      </form>
    </div>
  )
}

export default function Contact() {
  const { site } = useContent()
  const hero = { ...FALLBACK_HERO, ...(site?.contact?.hero || {}) }
  const locations = site?.contact?.locations?.length ? site.contact.locations : FALLBACK_LOCATIONS

  return (
    <>
      <PageHero
        eyebrow={hero.eyebrow}
        title={hero.title}
        lead={hero.lead}
      />

      <section className="py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-5 gap-8">
            <div className="lg:col-span-2 space-y-4">
              {contactInfo.map((info, i) => (
                <SectionReveal key={info.title} delay={i * 80}>
                  <div className="card card-hover p-6 flex items-start gap-4">
                    <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center shrink-0">
                      <info.icon size={20} className="text-primary" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="font-heading font-bold text-ink mb-1">{info.title}</h3>
                      {info.lines.map((line, idx) =>
                        info.href && idx === 0 ? (
                          <a key={line} href={info.href} className="block text-slate text-sm hover:text-primary transition-colors">
                            {line}
                          </a>
                        ) : (
                          <p key={line} className="text-slate text-sm">{line}</p>
                        )
                      )}
                    </div>
                  </div>
                </SectionReveal>
              ))}
              <SectionReveal delay={400}>
                <div className="rounded-2xl border border-primary/10 bg-white/85 p-6 shadow-card backdrop-blur-xl">
                  <div className="flex items-center gap-3 mb-3">
                    <MessageCircle size={20} className="text-primary-strong" aria-hidden="true" />
                    <h3 className="font-heading font-bold text-ink">Quick support</h3>
                  </div>
                  <p className="text-sm text-slate mb-4">For urgent scheduling questions, reach us on WhatsApp.</p>
                  <a
                    href="https://wa.me/254725519844"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-primary-strong text-white px-5 py-2.5 text-sm font-semibold shadow-glow transition-all duration-200 hover:-translate-y-0.5"
                  >
                    <MessageCircle size={16} aria-hidden="true" /> WhatsApp Us
                  </a>
                </div>
              </SectionReveal>
            </div>

            <div className="lg:col-span-3">
              <SectionReveal delay={150}>
                <InquiryForm />
              </SectionReveal>
            </div>
          </div>
        </div>
      </section>

      <section className="pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionReveal>
            <div className="rounded-3xl bg-cream p-10 lg:p-12">
              <h2 className="font-heading text-2xl lg:text-3xl font-bold text-ink mb-6">Locations</h2>
              <div className="grid md:grid-cols-3 gap-6">
                {locations.map((loc) => (
                  <div key={loc.place} className="rounded-2xl bg-white p-6 border border-mist">
                    <Icon name={loc.icon} size={20} className="text-primary mb-3" aria-hidden="true" />
                    <h3 className="font-heading font-semibold text-ink mb-1">{loc.place}</h3>
                    <p className="text-sm text-slate leading-relaxed">{loc.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </SectionReveal>
        </div>
      </section>
    </>
  )
}