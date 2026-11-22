// Editorial content for the Our Purpose page.
// Copy is adapted from Comet Healthcare's live "Our Purpose" page, tightened
// for a B2B pharmaceutical audience and aligned with the Comet Blue design
// system. Photography comes from the project's own facility library.

import { DEFAULT_MEDIA, photoSrc } from '../../lib/media.js'

const PHOTO_KEYS = {
  hero: 'facility.hero',
  belief: 'facility.packaging',
  integrity: 'facility.qualityLab',
  excellence: 'facility.tablets',
  service: 'facility.research',
  wellbeing: 'facility.operations',
  community: 'site.community',
  cta: 'site.story',
}

export function getImages(media = DEFAULT_MEDIA) {
  return Object.fromEntries(
    Object.entries(PHOTO_KEYS).map(([key, path]) => [key, photoSrc(media, path)])
  )
}

export const IMAGES = getImages()

export const SEO = {
  title: 'Our Purpose',
  description:
    'Comet Healthcare exists to restore hope and expand access to quality, affordable medicines across Kenya and East Africa — guided by integrity, excellence and human-centred service.',
}

export const HERO = {
  eyebrow: 'Home · Our Purpose',
  title: 'Our Purpose',
  lead:
    'We go beyond manufacturing medicines. We are here to restore hope, enable healthier futures and empower communities — because access to quality pharmaceutical care is a right, not a privilege.',
}

export const SECTIONS = [
  { id: 'belief', label: 'Our belief' },
  { id: 'principles', label: 'Our principles' },
  { id: 'wellbeing', label: 'Global health' },
  { id: 'service', label: 'Human-centred care' },
  { id: 'people', label: 'Our experts' },
  { id: 'next', label: 'Get involved' },
]

export const BELIEF = {
  eyebrow: 'Why we exist',
  title: 'Healthcare is a fundamental human right',
  image: IMAGES.belief,
  imageAlt: 'Pharmaceutical packaging and distribution at Comet Healthcare',
  quote: 'Access to quality pharmaceutical care is a right, not a privilege.',
  paragraphs: [
    'At Comet Healthcare, our purpose goes beyond manufacturing medications — we are in the business of restoring hope, enabling healthier futures and empowering communities. This belief drives us to innovate relentlessly, maintain uncompromising quality standards and keep effective, affordable medicines within reach of the people who depend on them.',
    'Behind every prescription is a person seeking better health and a better quality of life. Our patient-centred approach shapes how we formulate, manufacture, register and support every product — from the first dossier to the last mile of delivery.',
  ],
  commitments: [
    'Quality without compromise',
    'Affordable by design',
    'Accessible across East Africa',
  ],
  badge: { value: '20+', label: 'Years of pharmaceutical practice' },
}

export const PRINCIPLES = [
  {
    id: 'integrity',
    number: '01',
    icon: 'shieldcheck',
    tabLabel: 'Be guided by integrity',
    title: 'Be guided by integrity',
    kicker: 'Our non-negotiable compass',
    summary: 'Transparent, accountable and ethical — from the factory floor to after-sales service.',
    body:
      'Integrity is our non-negotiable compass. Every process — from pharmaceutical manufacturing to after-sales service — is carried out with transparency and accountability. Regulators, partners and patients can trust that our actions are ethical and our commitments are genuine.',
    proof: 'Documented at every stage — audited batches, traceable records and open communication.',
    image: IMAGES.integrity,
    imageAlt: 'Quality control laboratory at Comet Healthcare',
    action: { label: 'About Comet', to: '/about' },
  },
  {
    id: 'excellence',
    number: '02',
    icon: 'award',
    tabLabel: 'Build trust through excellence',
    title: 'Build trust through excellence',
    kicker: 'Consistent quality, earned daily',
    summary: 'Strict standards in production, compliance and service delivery build partnerships that last.',
    body:
      'Trust is earned through consistent quality. We maintain strict standards in production, compliance and service delivery, backed by current Good Manufacturing Practice and the discipline of a 20-year GMP heritage. Every interaction with Comet reinforces reliability and makes excellence the foundation of long-term partnerships.',
    proof: 'PPB-registered operations, cGMP-aligned facilities and batch testing before release.',
    image: IMAGES.excellence,
    imageAlt: 'Tablet production and finishing at Comet Healthcare',
    action: { label: 'See our services', to: '/services' },
  },
  {
    id: 'service',
    number: '03',
    icon: 'heart',
    tabLabel: 'Champion human-centred service',
    title: 'Champion human-centred service',
    kicker: 'People before processes',
    summary: 'Support that continues long after a product leaves our facility.',
    body:
      'Patients and communities are at the heart of our work. Beyond products, Comet provides after-sales support that ensures continuity of care. This human-centred approach builds deeper connections with healthcare providers and patients — showing that we value individuals as much as outcomes.',
    proof: 'Responsive regulatory, quality and commercial teams, available when partners need them.',
    image: IMAGES.service,
    imageAlt: 'Research and testing supporting patient outcomes',
    action: { label: 'Talk to our experts', to: '/experts' },
  },
]

export const WELLBEING = {
  eyebrow: 'Our commitment',
  title: 'Advance global health & wellbeing',
  paragraphs: [
    'Comet Healthcare exists to improve lives by producing medicines and healthcare solutions that meet international standards. Our focus is not only on treating illness, but also on strengthening prevention and long-term wellbeing.',
    'Every product we deliver is designed to make a measurable difference in patient health outcomes and community resilience — from essential generics at scale to specialised treatments for evolving healthcare needs.',
  ],
  image: IMAGES.wellbeing,
  imageAlt: 'Manufacturing operations supporting healthcare across East Africa',
  imageCaption: 'From Machakos to the region',
  metrics: [
    { value: 20, suffix: '+', label: 'Years of GMP practice', detail: 'Continuous pharmaceutical experience' },
    { value: 14, suffix: '+', label: 'Registered products', detail: 'Supported from dossier to market' },
    { value: 100, suffix: '%', label: 'Batch quality tested', detail: 'Before any product leaves our facility' },
  ],
  badges: ['cGMP aligned', 'PPB registered', 'East African reach'],
  statement: 'Better formulations. Stronger supply chains. Healthier communities.',
}

export const SERVICE = {
  eyebrow: 'Human-centred care',
  title: 'Support that continues after the product',
  lead:
    'Access is more than a delivery. We pair reliable products with practical support so healthcare providers can protect continuity of care for the people they serve.',
  items: [
    {
      icon: 'clipboard',
      title: 'After-sales support',
      body: 'Documentation, product information and responsive guidance for the teams prescribing, dispensing and administering our medicines.',
      to: '/contact',
      linkLabel: 'Request support',
    },
    {
      icon: 'globe',
      title: 'Continuity of care',
      body: 'Forecasting, dependable supply and quality systems that keep essential medicines available when and where they are needed.',
      to: '/products',
      linkLabel: 'Explore products',
    },
    {
      icon: 'users',
      title: 'Community partnerships',
      body: 'Collaboration with county health facilities, NGOs and distributors to extend the reach of affordable, quality healthcare.',
      to: '/services',
      linkLabel: 'See our work',
    },
  ],
}

export const PEOPLE = {
  eyebrow: 'Purpose in practice',
  title: 'The specialists behind the promise',
  lead:
    'Our regulatory, quality, manufacturing and commercial experts turn a stated purpose into outcomes partners can measure.',
  ctaLabel: 'Browse all experts',
}

export const CTA = {
  image: IMAGES.cta,
  eyebrow: 'Want to find out more?',
  title: 'Let’s build healthier communities together',
  body:
    'Discover how Comet Healthcare can support your healthcare needs with quality medications, competitive pricing and exceptional service. Talk to our team about bespoke end-to-end CDMO support for your complete drug lifecycle — at any scale.',
  primary: { label: 'Get in touch', to: '/contact' },
  secondary: { label: 'Book a consultation', to: '/book' },
  tertiary: { label: 'Explore our products', to: '/products' },
  assurances: ['GMP-certified facility', 'PPB registered', 'Senior specialists', 'East Africa'],
}
