import { useState } from 'react'
import { CheckCircle2, ArrowRight } from 'lucide-react'
import PageHero from '../components/PageHero.jsx'
import SectionReveal from '../components/SectionReveal.jsx'
import ProductSlider from '../components/ProductSlider.jsx'
import CTASection from '../components/CTASection.jsx'
import Button from '../components/ui/Button.jsx'
import { Field, Input, Textarea } from '../components/ui/Field.jsx'
import Alert from '../components/ui/Alert.jsx'
import { api, fieldErrorsFrom } from '../lib/api.js'
import { Icon } from '../lib/icons.jsx'
import { gallery } from '../lib/media.js'
import { useContent } from '../context/ContentContext.jsx'

// Fallbacks mirror the server CMS defaults so the page renders if the API is down.
const FALLBACK_ITEMS = [
  { image: gallery('DSC_0475.jpg'), alt: 'Comet Healthcare product 1' },
  { image: gallery('DSC_0481.jpg'), alt: 'Comet Healthcare product 2' },
  { image: gallery('DSC_2897.jpg'), alt: 'Comet Healthcare product 3' },
  { image: gallery('DSC_2997.jpg'), alt: 'Comet Healthcare product 4' },
  { image: gallery('DSC_3000.jpg'), alt: 'Comet Healthcare product 5' },
  { image: gallery('DSC_3004.jpg'), alt: 'Comet Healthcare product 6' },
  { image: gallery('DSC_3007.jpg'), alt: 'Comet Healthcare product 7' },
  { image: gallery('DSC_3009.jpg'), alt: 'Comet Healthcare product 8' },
  { image: gallery('DSC_3014.jpg'), alt: 'Comet Healthcare product 9' },
  { image: gallery('DSC_3021.jpg'), alt: 'Comet Healthcare product 10' },
  { image: gallery('DSC_3119.jpg'), alt: 'Comet Healthcare product 11' },
  { image: gallery('DSC_3135.jpg'), alt: 'Comet Healthcare product 12' },
  { image: gallery('DSC_3147.jpg'), alt: 'Comet Healthcare product 13' },
  { image: gallery('DSC_3159.jpg'), alt: 'Comet Healthcare product 14' },
  { image: gallery('DSC_3165.jpg'), alt: 'Comet Healthcare product 15' },
  { image: gallery('DSC_3177.jpg'), alt: 'Comet Healthcare product 16' },
  { image: gallery('DSC_3189.jpg'), alt: 'Comet Healthcare product 17' },
  { image: gallery('DSC_3197.jpg'), alt: 'Comet Healthcare product 18' },
  { image: gallery('DSC_3205.jpg'), alt: 'Comet Healthcare product 19' },
  { image: gallery('DSC_3219.jpg'), alt: 'Comet Healthcare product 20' },
  { image: gallery('DSC_3232.jpg'), alt: 'Comet Healthcare product 21' },
  { image: gallery('DSC_3259.jpg'), alt: 'Comet Healthcare product 22' },
  { image: gallery('DSC_3280.jpg'), alt: 'Comet Healthcare product 23' },
  { image: gallery('DSC_3304.jpg'), alt: 'Comet Healthcare product 24' },
  { image: gallery('DSC_3317.jpg'), alt: 'Comet Healthcare product 25' },
  { image: gallery('DSC_3333.jpg'), alt: 'Comet Healthcare product 26' },
  { image: gallery('DSC_3358.jpg'), alt: 'Comet Healthcare product 27' },
  { image: gallery('DSC_3367.jpg'), alt: 'Comet Healthcare product 28' },
  { image: gallery('DSC_3388.jpg'), alt: 'Comet Healthcare product 29' },
  { image: gallery('DSC_3456.jpg'), alt: 'Comet Healthcare product 30' },
]

const FALLBACK_SERVICES = [
  { icon: 'shield', title: 'Quality Assurance & GMP Compliance', desc: 'Every product meets Kenyan and international standards through batch testing, SOP development, supplier verification and continuous improvement.' },
  { icon: 'file', title: 'Regulatory Affairs & Product Registration', desc: 'Full PPB compliance through dossier preparation, product registration and renewals — regional pathways included.' },
  { icon: 'trend', title: 'Affordable Access Initiatives', desc: 'Collaboration with county health facilities and NGOs to keep essential medicines accessible and affordable.' },
  { icon: 'package', title: 'Contract Manufacturing (CDMO)', desc: 'Bespoke end-to-end CDMO support for your complete drug lifecycle at any scale.' },
]

function CatalogRequest() {
  const [form, setForm] = useState({ name: '', company: '', email: '', message: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    setSubmitting(true)
    try {
      await api.post('/inquiries', { kind: 'CATALOG', ...form })
      setDone(true)
      setForm({ name: '', company: '', email: '', message: '' })
    } catch (err) {
      const fieldMap = fieldErrorsFrom(err.data || {})
      if (Object.keys(fieldMap).length) setFieldErrors(fieldMap)
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-primary/10 bg-white p-8 text-center shadow-card">
        <CheckCircle2 size={40} className="text-primary mx-auto mb-4" aria-hidden="true" />
        <h3 className="text-xl font-bold font-heading text-ink mb-2">Request received</h3>
        <p className="text-slate text-sm leading-relaxed">
          Thanks — our team will email you the catalogue and price list within one business day.
        </p>
        <Button variant="primary" size="sm" className="mt-5" onClick={() => setDone(false)}>
          Send another request
        </Button>
      </div>
    )
  }

  return (
    <form className="rounded-2xl border border-primary/10 bg-white p-8 shadow-card space-y-4" onSubmit={submit} noValidate>
      {error && <Alert type="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Full name" htmlFor="cat-name" error={fieldErrors.name} required>
          <Input id="cat-name" required invalid={!!fieldErrors.name} value={form.name} onChange={setField('name')} placeholder="Jane Doe" />
        </Field>
        <Field label="Company" htmlFor="cat-company">
          <Input id="cat-company" value={form.company} onChange={setField('company')} placeholder="Acme Pharma Ltd" />
        </Field>
      </div>
      <Field label="Work email" htmlFor="cat-email" error={fieldErrors.email} required>
        <Input id="cat-email" type="email" required invalid={!!fieldErrors.email} value={form.email} onChange={setField('email')} placeholder="you@company.com" />
      </Field>
      <Field label="Message" htmlFor="cat-msg" error={fieldErrors.message} required>
        <Textarea id="cat-msg" rows={4} required invalid={!!fieldErrors.message} value={form.message} onChange={setField('message')} placeholder="e.g. We'd like the distributor price list and catalogue for our pharmacy chain." />
      </Field>
      <Button type="submit" variant="primary" block size="md" loading={submitting}>
        Submit Request <ArrowRight size={16} aria-hidden="true" />
      </Button>
      <p className="text-slate text-xs text-center">
        Our team responds within one business day.
      </p>
    </form>
  )
}

export default function Products() {
  const { site } = useContent()
  const products = site?.products || {}
  const hero = products.hero || {}
  const gallery = products.gallery || {}
  const services = products.services?.items || FALLBACK_SERVICES
  const catalogue = products.catalogue || {}

  const items = (gallery.items?.length ? gallery.items : FALLBACK_ITEMS).slice(0, 30)

  return (
    <>
      <PageHero
        eyebrow={hero.eyebrow || 'Our Portfolio'}
        title={hero.title || 'Products built on 20 years of GMP discipline'}
        lead={hero.lead || 'A curated portfolio of medications that combine scientific innovation with proven therapeutic value — every batch quality-assured.'}
      >
        <Button to="/contact" size="lg">
          Request the catalogue <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </PageHero>

      <section className="py-20 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionReveal>
            <div className="text-center mb-12">
              <span className="eyebrow">{gallery.eyebrow || 'Product Showcase'}</span>
              <h2 className="font-heading text-3xl md:text-4xl font-bold text-ink mt-3">
                {gallery.title || 'Browse the range'}
              </h2>
              {gallery.lead && <p className="text-slate mt-4 max-w-2xl mx-auto">{gallery.lead}</p>}
            </div>
          </SectionReveal>

          <SectionReveal>
            <ProductSlider items={items} />
          </SectionReveal>

          <p className="text-center text-xs text-slate mt-8">
            {gallery.notes || 'Photos shown are representative of our manufacturing, quality and packaging operations. Request the catalogue below for the full product list and specifications.'}
          </p>
        </div>
      </section>

      <section className="py-20 lg:py-24 bg-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionReveal>
            <div className="text-center mb-14">
              <span className="eyebrow">{products.services?.eyebrow || 'Our Offerings'}</span>
              <h2 className="font-heading text-3xl md:text-4xl font-bold text-ink mt-3">
                {products.services?.title || 'Beyond the products'}
              </h2>
            </div>
          </SectionReveal>
          <div className="grid sm:grid-cols-2 gap-6">
            {services.map((s, i) => (
              <SectionReveal key={`${s.title}-${i}`} delay={i * 100}>
                <div className="card card-hover p-8">
                  <div className="flex items-center gap-4 mb-5">
                    <div className="w-14 h-14 bg-primary-50 rounded-2xl flex items-center justify-center shrink-0">
                      <Icon name={s.icon} size={26} className="text-primary" aria-hidden="true" />
                    </div>
                    <h3 className="text-lg font-bold text-ink font-heading">{s.title}</h3>
                  </div>
                  <p className="text-slate text-sm leading-relaxed">{s.desc}</p>
                </div>
              </SectionReveal>
            ))}
          </div>
        </div>
      </section>

      <section id="catalogue" className="py-20 lg:py-24 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionReveal>
            <div className="relative overflow-hidden rounded-3xl border border-primary/10 bg-gradient-to-br from-white via-primary-50 to-primary-100 p-10 shadow-card lg:p-14">
              <div className="absolute -top-16 -right-16 h-72 w-72 rounded-full bg-primary-light/20 blur-3xl" aria-hidden="true" />
              <div className="absolute inset-0 bg-grid opacity-20" aria-hidden="true" />
              <div className="relative grid gap-10 lg:grid-cols-2 lg:items-center">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-primary uppercase tracking-wider text-sm font-semibold">{catalogue.eyebrow || 'Request a Catalogue'}</span>
                  </div>
                  <h2 className="font-heading text-3xl font-extrabold tracking-[-0.03em] text-ink md:text-4xl">{catalogue.title || 'New customer?'}</h2>
                  <p className="leading-relaxed text-slate">
                    {catalogue.lead || 'Request our distributor catalogue and price list. Bulk ordering, county facility supply and NGO partnerships all start with the same conversation.'}
                  </p>
                </div>
                <CatalogRequest />
              </div>
            </div>
          </SectionReveal>
        </div>
      </section>

      <CTASection />
    </>
  )
}