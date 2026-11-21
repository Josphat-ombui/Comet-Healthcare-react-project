import SectionReveal from '../components/SectionReveal'
import CTASection from '../components/CTASection'
import { Icon } from '../lib/icons.jsx'
import { useContent, useMedia } from '../context/ContentContext.jsx'
import { photoSrc } from '../lib/media.js'

const FALLBACK = {
  hero: {
    eyebrow: 'Our Expertise',
    title: 'Our Science',
    lead: "The Science and Soul Behind Our Formulations. We don't chase trends—we anticipate them, building formulations that perform under pressure while infusing every product with purpose.",
  },
  approach: {
    title: 'Our Scientific Approach',
    lead: 'From formulation to distribution, our science blends technical expertise with resilient supply chains to ensure availability, reliability, and safety for millions of patients across the continent.',
    items: [
      { icon: 'beaker', title: 'Formulation Development', desc: 'Improving bioavailability, reducing excipient load, and enhancing shelf life to build formulations that perform under pressure.' },
      { icon: 'shield', title: 'Quality Control', desc: 'Analytical method validation, raw material testing, in-process controls, and finished product evaluation.' },
      { icon: 'microscope', title: 'Research & Innovation', desc: 'Anticipating trends in pharmaceutical science to stay ahead of the curve and deliver better outcomes for patients.' },
      { icon: 'flask', title: 'Active Testing', desc: 'Rigorous testing protocols ensuring every batch meets British Pharmacopoeia standards.' },
      { icon: 'tablet', title: 'Generic & Brand', desc: 'Balancing essential generics at scale with advanced specialty treatments for diverse healthcare needs.' },
      { icon: 'atom', title: 'Green Chemistry', desc: 'Embracing emerging trends in sustainable drug manufacturing for a healthier planet.' },
    ],
  },
  feature: {
    title: 'Built to Perform Under Pressure',
    lead: 'Whether providing essential generics at scale or introducing advanced specialty treatments, our science is engineered for real-world performance.',
    goal: 'Reduce excipient load, enhance shelf life, and improve bioavailability in every formulation we create.',
    items: [
      { icon: 'testtube', title: 'Analytical Method Validation', desc: 'Validated methods ensuring accurate and reliable test results for every batch.' },
      { icon: 'pill', title: 'Bioavailability Optimization', desc: 'Enhancing drug absorption to maximize therapeutic effect at every dose.' },
      { icon: 'microscope', title: 'In-Process Controls', desc: 'Continuous monitoring throughout production to guarantee consistent quality.' },
      { icon: 'shield', title: 'Finished Product Evaluation', desc: 'Comprehensive final evaluation before product release to patients.' },
    ],
  },
}

export default function Science() {
  const { site } = useContent()
  const media = useMedia()
  const science = site?.science || {}
  const hero = { ...FALLBACK.hero, ...(science.hero || {}) }
  const approach = { ...FALLBACK.approach, ...(science.approach || {}) }
  const feature = {
    image: photoSrc(media, 'site.lab'),
    ...FALLBACK.feature,
    ...(science.feature || {}),
  }

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-white via-primary-50 to-primary-100 py-24 lg:py-32">
        <div className="absolute inset-0 bg-grid opacity-20" aria-hidden="true" />
        <div className="absolute -top-24 -right-16 h-80 w-80 rounded-full bg-primary-light/20 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-28 -left-20 h-96 w-96 rounded-full bg-primary-strong/10 blur-3xl" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">{hero.eyebrow}</span>
          <h1 className="mt-4 mb-6 font-heading text-4xl font-extrabold tracking-[-0.03em] text-ink md:text-5xl lg:text-6xl">{hero.title}</h1>
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate">{hero.lead}</p>
        </div>
      </section>

      <section className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionReveal>
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-dark font-heading">{approach.title}</h2>
              <p className="text-gray-600 mt-4 max-w-2xl mx-auto">{approach.lead}</p>
            </div>
          </SectionReveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {(approach.items || []).map((area, i) => (
              <SectionReveal key={`${area.title}-${i}`} delay={i * 100}>
                <div className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-2 border border-gray-100">
                  <div className="w-14 h-14 bg-accent rounded-2xl flex items-center justify-center mb-5">
                    <Icon name={area.icon} size={26} className="text-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-dark font-heading mb-3">{area.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{area.desc}</p>
                </div>
              </SectionReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-28 bg-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionReveal>
            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1">
                <div className="rounded-2xl overflow-hidden shadow-lg mb-6">
                  <img src={feature.image || photoSrc(media, 'site.lab')} alt="Laboratory research" className="w-full h-48 object-cover" loading="lazy" />
                </div>
                <h2 className="text-3xl font-bold text-dark font-heading mb-4">{feature.title}</h2>
                <p className="text-gray-600 leading-relaxed mb-6">{feature.lead}</p>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex items-center gap-3 mb-3">
                    <Icon name="trend" size={20} className="text-primary" />
                    <span className="font-semibold text-dark">Our Goal</span>
                  </div>
                  <p className="text-sm text-gray-600">{feature.goal}</p>
                </div>
              </div>
              <div className="lg:col-span-2 grid sm:grid-cols-2 gap-6">
                {(feature.items || []).map((item, i) => (
                  <SectionReveal key={`${item.title}-${i}`} delay={i * 100}>
                    <div className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100">
                      <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center mb-3">
                        <Icon name={item.icon} size={18} className="text-white" />
                      </div>
                      <h3 className="font-bold text-dark font-heading mb-2">{item.title}</h3>
                      <p className="text-gray-600 text-sm">{item.desc}</p>
                    </div>
                  </SectionReveal>
                ))}
              </div>
            </div>
          </SectionReveal>
        </div>
      </section>

      <CTASection />
    </>
  )
}