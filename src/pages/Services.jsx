import {
  ArrowRight, CheckCircle2,
} from 'lucide-react'
import PageHero from '../components/PageHero.jsx'
import SectionHeading from '../components/SectionHeading.jsx'
import SectionReveal from '../components/SectionReveal.jsx'
import Button from '../components/ui/Button.jsx'
import CTA from '../components/CTASection.jsx'
import { Icon } from '../lib/icons.jsx'
import { useContent } from '../context/ContentContext.jsx'

const services = [
  {
    icon: 'flask',
    title: 'CDMO & Contract Manufacturing',
    blurb: 'Bespoke end-to-end development and manufacturing partnerships at any scale.',
    items: [
      'Pre-formulation studies & formulation development',
      'Scale-up and technology transfer to GMP lines',
      'Process optimisation and packaging design',
      'Analytical method development & validation',
    ],
    tag: 'Book a CDMO consultation',
    slug: 'christopher-musembi',
  },
  {
    icon: 'file',
    title: 'Regulatory Affairs & Registration',
    blurb: 'Get products registered across East Africa without the guesswork.',
    items: [
      'Dossier preparation and submission',
      'Product registration and renewals (PPB + EAC)',
      'Pharmacopoeia alignment and labelling review',
      'Post-approval change management',
    ],
    tag: 'Book a regulatory consultation',
    slug: 'dr-grace-odhiambo',
  },
  {
    icon: 'shield',
    title: 'Quality Assurance & GMP Compliance',
    blurb: 'Independent quality discipline from batch release to plant readiness.',
    items: [
      'Batch testing, release and documentation',
      'SOP development and training',
      'Supplier and raw-material verification',
      'Internal audits & continuous improvement',
    ],
    tag: 'Book a QA consultation',
    slug: 'james-karanja',
  },
  {
    icon: 'microscope',
    title: 'R&D & Formulation Science',
    blurb: 'Scientific problem-solving for solid orals, FDCs and novel formats.',
    items: [
      'Pre-formulation and excipient selection',
      'Fixed-dose combination development',
      'Bioequivalence-driven optimisation',
      'Scale-up batch strategy',
    ],
    tag: 'Book an R&D consultation',
    slug: 'dr-linda-mutua',
  },
  {
    icon: 'grad',
    title: 'Training & Digital Health',
    blurb: 'Practical programs that build capability inside your organisation.',
    items: [
      'Regulatory compliance & safety training',
      'Digital tools & website security',
      'Healthcare branding & communication',
      'Leadership & professional growth',
    ],
    tag: 'Book a training consultation',
    slug: 'michael-kamau',
  },
  {
    icon: 'package',
    title: 'Pharmaceutical Products & Supply',
    blurb: 'Affordable, quality-assured medicines for facilities and distributors.',
    items: [
      '14+ registered product lines',
      'County facility and NGO partnership supply',
      'Distributor and stockist programmes',
      'Certificate of Analysis with every batch',
    ],
    tag: 'Request our product catalogue',
    slug: null,
  },
  {
    icon: 'trend',
    title: 'Affordable Access Initiatives',
    blurb: 'Public-health programmes that make essential medicines reach further.',
    items: [
      'Collaboration with county health facilities',
      'NGO partnership programs',
      'Community health outreach',
    ],
    tag: 'Talk to partnerships',
    slug: 'samuel-otieno',
  },
]

export default function Services() {
  const { site } = useContent()
  const cmsServices = site?.services || {}
  const hero = { ...{ eyebrow: 'What We Offer', title: 'Services built for the whole drug lifecycle', lead: 'Direct expert consultation layered on 20+ years of GMP manufacturing — so you can move faster with people who have done it before.' }, ...(cmsServices.hero || {}) }
  const list = cmsServices.items?.length ? cmsServices.items : services

  return (
    <>
      <PageHero
        eyebrow={hero.eyebrow}
        title={hero.title}
        lead={hero.lead}
      >
        <Button to="/book" size="lg">
          Book a consultation <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </PageHero>

      <section className="py-20 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {list.map((s, i) => (
              <SectionReveal key={`${s.title}-${i}`} delay={(i % 3) * 80}>
                <div className="card card-hover p-7 h-full flex flex-col">
                  <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center mb-5">
                    <Icon name={s.icon} size={22} className="text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="font-heading text-xl font-semibold text-ink mb-1.5">{s.title}</h3>
                  <p className="text-sm text-slate mb-4">{s.blurb}</p>
                  <ul className="space-y-2.5 mb-6 flex-1">
                    {(s.items || []).map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-sm text-ink/80">
                        <CheckCircle2 size={16} className="text-primary shrink-0 mt-0.5" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  {s.slug ? (
                    <Button to={`/book/${s.slug}`} variant="outline" size="sm" className="mt-auto">
                      {s.tag} <ArrowRight size={14} aria-hidden="true" />
                    </Button>
                  ) : (
                    <Button to="/products#catalogue" variant="outline" size="sm" className="mt-auto">
                      {s.tag} <ArrowRight size={14} aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </SectionReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-primary/10 bg-gradient-to-br from-white via-primary-50 to-primary-100 p-10 shadow-card lg:p-14">
            <div className="absolute -top-16 -right-16 h-72 w-72 rounded-full bg-primary-light/20 blur-3xl" aria-hidden="true" />
            <div className="absolute inset-0 bg-grid opacity-20" aria-hidden="true" />
            <div className="relative">
              <SectionHeading
                eyebrow="Not sure where to start?"
                title="Tell us what you're trying to build."
                lead="Send your brief and the right specialist will reach out with a concrete next step — usually within one business day."
              />
              <div className="mt-8 flex flex-wrap gap-3">
                <Button to="/contact" variant="primary" size="md">
                  Send an inquiry <ArrowRight size={16} aria-hidden="true" />
                </Button>
                <Button to="/experts" variant="outline" size="md">
                  Browse all experts
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <CTA />
    </>
  )
}