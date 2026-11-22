import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import SectionReveal from '../components/SectionReveal'
import CTASection from '../components/CTASection'
import { Icon } from '../lib/icons.jsx'
import { ROUTES } from '../lib/navigation.js'
import { useContent, useMedia } from '../context/ContentContext.jsx'
import { photoSrc } from '../lib/media.js'

const FALLBACK = {
  hero: {
    eyebrow: 'About Us',
    title: 'About Comet Healthcare',
    lead: 'Building a distinguished reputation and gaining extensive experience over 20 years of pharmaceutical excellence in Kenya and East Africa.',
  },
  story: {
    eyebrow: 'Our Story',
    title: 'Leading Pharmaceutical Manufacturer in Kenya & East Africa',
    paragraphs: [
      'Comet Healthcare Ltd has built a distinguished reputation and gained extensive experience over the last 20 years. Our purpose is to bridge the gaps that limit access to essential medicines and healthcare support in Kenya.',
      'We are a manufacturer of generic and brand pharmaceuticals with a mission to provide high quality, safe, efficacious, and cost-effective medicines to alleviate global health challenges.',
      'Our dedicated team continuously works to develop innovative pharmaceutical solutions that address the evolving healthcare needs of our communities. We invest in research to improve existing formulations and create new treatment options that are both effective and accessible.',
    ],
    image: '/images/pharma.jpg',
    stats: [
      { icon: 'building', value: '20+', label: 'Years in Operation' },
      { icon: 'pill', value: '14+', label: 'Products' },
      { icon: 'users', value: '100+', label: 'Team Members' },
      { icon: 'microscope', value: 'BP', label: 'Compliant Standards' },
    ],
  },
  journey: {
    eyebrow: 'Our Journey',
    title: 'Milestones',
    items: [
      { year: '2006', title: 'Founded', desc: 'Comet Healthcare Ltd was established with a vision to provide affordable, quality pharmaceuticals to Kenya.' },
      { year: '2010', title: 'PPB Licensed', desc: 'Received full manufacturing and distribution licenses from Kenya\'s Pharmacy and Poisons Board.' },
      { year: '2015', title: 'Regional Expansion', desc: 'Expanded distribution networks across East Africa, serving Uganda, Tanzania, Rwanda, and South Sudan.' },
      { year: '2020', title: 'Digital Transformation', desc: 'Embraced digital health solutions including e-pharmacy integration and WhatsApp-based prescription support.' },
      { year: '2024', title: 'CDMO Launch', desc: 'Launched full-service Contract Development and Manufacturing Organization capabilities.' },
      { year: '2026', title: '20 Years Strong', desc: 'Celebrating two decades of pharmaceutical excellence and community impact.' },
    ],
  },
  values: {
    eyebrow: 'What Guides Us',
    title: 'Core Values',
    items: [
      { icon: 'shield', title: 'Integrity', desc: 'We uphold the highest ethical standards in all our operations. Transparency, honesty, and accountability guide every decision we make.' },
      { icon: 'award', title: 'Excellence', desc: 'We strive for excellence in everything we do, from product development to customer service, setting the bar high for pharmaceutical manufacturing.' },
      { icon: 'bulb', title: 'Innovation', desc: 'We invest in research and development to create innovative solutions that address the evolving healthcare needs of our communities.' },
      { icon: 'heart', title: 'Quality Assurance', desc: 'Patient safety is our top priority. We maintain rigorous quality control standards at every stage of pharmaceutical production.' },
    ],
  },
}

export default function About() {
  const { site } = useContent()
  const media = useMedia()
  const about = site?.about || {}
  const hero = { ...FALLBACK.hero, ...(about.hero || {}) }
  const story = { ...FALLBACK.story, ...(about.story || {}) }
  const journey = { ...FALLBACK.journey, ...(about.journey || {}) }
  const values = { ...FALLBACK.values, ...(about.values || {}) }

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-white via-primary-50 to-primary-100 py-24 lg:py-32">
        <div className="absolute inset-0 bg-grid opacity-20" aria-hidden="true" />
        <div className="absolute -top-24 -right-16 h-80 w-80 rounded-full bg-primary-light/20 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-28 -left-20 h-96 w-96 rounded-full bg-primary-strong/10 blur-3xl" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">{hero.eyebrow}</span>
          <h1 className="mt-4 mb-6 font-heading text-4xl font-extrabold tracking-[-0.03em] text-ink md:text-5xl lg:text-6xl">
            {hero.title}
          </h1>
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate">
            {hero.lead}
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionReveal>
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div className="space-y-6">
                <span className="text-secondary font-semibold text-sm uppercase tracking-wider">{story.eyebrow}</span>
                <h2 className="text-3xl md:text-4xl font-bold text-dark font-heading leading-tight">
                  {story.title}
                </h2>
                {(story.paragraphs || []).map((p, i) => (
                  <p key={i} className="text-gray-600 leading-relaxed">{p}</p>
                ))}
                <Link
                  to={ROUTES.purpose}
                  className="group inline-flex items-center gap-2 text-sm font-bold text-primary transition-colors hover:text-primary-strong"
                >
                  Explore our purpose
                  <ArrowRight size={16} aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
              </div>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  {(story.stats || []).map((stat) => (
                    <div key={stat.label} className="bg-cream p-6 rounded-2xl text-center">
                      <Icon name={stat.icon} size={28} className="text-primary mx-auto mb-3" />
                      <div className="text-3xl font-bold text-dark font-heading">{stat.value}</div>
                      <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl overflow-hidden shadow-lg">
                  <img src={story.image || photoSrc(media, 'site.pharma')} alt="Pharmaceutical manufacturing" className="w-full h-56 object-cover" loading="lazy" />
                </div>
              </div>
            </div>
          </SectionReveal>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-20 lg:py-28 bg-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionReveal>
            <div className="text-center mb-16">
              <span className="text-secondary font-semibold text-sm uppercase tracking-wider">{journey.eyebrow}</span>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-dark mt-3 font-heading">{journey.title}</h2>
            </div>
          </SectionReveal>
          <div className="relative max-w-3xl mx-auto">
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-primary/20 -translate-x-1/2 hidden md:block" />
            <div className="space-y-8">
              {(journey.items || []).map((m, i) => (
                <SectionReveal key={`${m.year}-${i}`} delay={i * 100}>
                  <div className="flex flex-col md:flex-row items-center gap-4">
                    <div className={`flex-1 ${i % 2 === 0 ? 'md:text-right' : 'md:text-left'}`}>
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 inline-block max-w-sm">
                        <span className="text-secondary font-bold text-sm">{m.year}</span>
                        <h3 className="text-lg font-bold text-dark font-heading mt-1">{m.title}</h3>
                        <p className="text-gray-600 text-sm mt-2">{m.desc}</p>
                      </div>
                    </div>
                    <div className="w-4 h-4 bg-primary rounded-full border-4 border-white shadow-md z-10 shrink-0" />
                    <div className="flex-1 hidden md:block" />
                  </div>
                </SectionReveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionReveal>
            <div className="text-center mb-16">
              <span className="text-secondary font-semibold text-sm uppercase tracking-wider">{values.eyebrow}</span>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-dark mt-3 font-heading">{values.title}</h2>
              <Link
                to={ROUTES.culture}
                className="group mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary transition-colors hover:text-primary-strong"
              >
                See how we work together
                <ArrowRight size={16} aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            </div>
          </SectionReveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {(values.items || []).map((v, i) => (
              <SectionReveal key={`${v.title}-${i}`} delay={i * 100}>
                <div className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-2 border border-gray-100 text-center">
                  <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center mx-auto mb-5">
                    <Icon name={v.icon} size={28} className="text-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-dark mb-3 font-heading">{v.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{v.desc}</p>
                </div>
              </SectionReveal>
            ))}
          </div>
        </div>
      </section>

      <CTASection />
    </>
  )
}