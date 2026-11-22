// Editorial content for the Our Mission & Vision page.
// Structure follows the clarity of CordenPharma's mission page, rewritten for
// Comet Healthcare with local photography from the project's own photo library.

import { ROUTES } from '../../lib/navigation.js'
import { DEFAULT_MEDIA, photoSrc } from '../../lib/media.js'

const PHOTO_KEYS = {
  hero: 'mission.gmp',
  mission: 'mission.gmp',
  vision: 'mission.facility',
  quality: 'mission.quality',
  lab: 'mission.lab',
  production: 'mission.production',
}

export function getImages(media = DEFAULT_MEDIA) {
  return Object.fromEntries(
    Object.entries(PHOTO_KEYS).map(([key, path]) => [key, photoSrc(media, path)])
  )
}

export const IMAGES = getImages()

export const SEO = {
  title: 'Our Mission & Vision',
  description:
    'Comet Healthcare exists to close the gap between scientific possibility and affordable, reliable medicine — building a pharmaceutical partner Kenya and East Africa can trust.',
}

export const HERO = {
  eyebrow: 'About Comet · Mission & Vision',
  title: 'Our Mission & Vision',
  lead: 'We go beyond manufacturing medicines. We exist to close the gap between scientific possibility and affordable, reliable healthcare — building a pharmaceutical partner Kenya and East Africa can trust.',
}

export const SECTIONS = [
  { id: 'mission', label: 'Our mission' },
  { id: 'vision', label: 'Our vision' },
  { id: 'values', label: 'Our values' },
  { id: 'focus', label: 'How we deliver' },
  { id: 'next', label: 'Work with us' },
]

export const MISSION = {
  eyebrow: 'Our Mission',
  title: 'Better medicines, built around real patient needs',
  lead: 'To address real medical needs through world-class pharmaceutical manufacturing — combining rigorous science, resilient supply and genuine care for the people behind every prescription.',
  paragraphs: [
    'We manufacture quality, affordable generics and specialty medicines to recognised cGMP standards, supporting healthcare providers from the first dossier to the last mile of delivery.',
    'Our teams invest in research and formulation improvement so existing therapies become safer, more accessible and better suited to the communities we serve. Innovation only matters when it reaches the people who need it.',
    'Every batch is tested, documented and released with the same discipline. For us, reliability is not a claim made in a brochure — it is a daily practice on the factory floor, in the lab and in every partnership we hold.',
  ],
  image: IMAGES.mission,
  imageAlt: 'GMP-compliant production environment at Comet Healthcare',
  stats: [
    { value: '20+', label: 'Years of practice' },
    { value: 'PPB', label: 'Registered operations' },
    { value: '14+', label: 'Products supported' },
    { value: '100%', label: 'Batch quality tested' },
  ],
}

export const VISION = {
  eyebrow: 'Our Vision',
  title: 'To be the CDMO partner East Africa can rely on',
  lead: 'A trusted, transparent and highly capable pharmaceutical partner — known for integrated solutions, uncompromising quality and the confidence to deliver at any scale.',
  paragraphs: [
    'We envision Comet Healthcare as the first choice for manufacturers and health systems seeking end-to-end support across formulation, registration, manufacturing and distribution.',
    'Our ambition is to make advanced pharmaceutical capability local: close to patients, responsive to partners and resilient enough to serve the wider region.',
    'We measure progress not only by output, but by the trust we earn — with regulators, customers, colleagues and the communities whose health depends on our work.',
  ],
  image: IMAGES.vision,
  imageAlt: 'Comet Healthcare pharmaceutical facility in Machakos, Kenya',
  quote: 'Trusted locally. Built to global standards.',
  pillars: [
    { title: 'Integrated capability', desc: 'Formulation, manufacturing, quality and registration under one accountable roof.' },
    { title: 'Transparent partnership', desc: 'Clear plans, shared risks and direct access to the people making decisions.' },
    { title: 'Regional resilience', desc: 'Supply systems designed for East Africa, not exported as an afterthought.' },
  ],
}

export const VALUES = {
  eyebrow: 'Our Values',
  title: 'The standards we hold ourselves to',
  lead: 'Our values are not wall art. They are the behaviours that keep medicines safe, partners confident and patients protected.',
  items: [
    {
      icon: 'clipboard',
      title: 'Accountability',
      desc: 'We own our actions and our outcomes — from a deviated batch to a delayed shipment — and we close the loop with evidence.',
    },
    {
      icon: 'users',
      title: 'Collaboration',
      desc: 'We bring scientists, operators, quality specialists and customers into the same conversation early, because better decisions are shared decisions.',
    },
    {
      icon: 'shieldcheck',
      title: 'Integrity',
      desc: 'We are honest with each other and our partners, keep transparent records and do the right thing even when no one is watching.',
    },
    {
      icon: 'heart',
      title: 'Trust',
      desc: 'We earn confidence by making clear commitments and then meeting them — batch after batch, project after project.',
    },
    {
      icon: 'clock',
      title: 'Reliability',
      desc: 'We deliver consistently so our customers, their patients and our communities can plan around us with certainty.',
    },
  ],
}

export const FOCUS = {
  eyebrow: 'How we deliver',
  title: 'What our mission looks like in practice',
  lead: 'Four disciplines turn a stated ambition into outcomes partners can measure.',
  image: IMAGES.quality,
  imageAlt: 'Analytical instruments in the Comet Healthcare quality control laboratory',
  items: [
    {
      id: 'customer',
      tabLabel: 'Customer centricity',
      icon: 'heart',
      title: 'Customer Centricity & Service',
      body: 'Every decision starts with the patient and the healthcare professional who depends on us. We anticipate regulatory, formulation and supply needs before they become delays, and we give partners direct access to senior specialists.',
      bullets: [
        'Patient-first decisions in formulation, packaging and supply',
        'Direct access to senior technical and regulatory specialists',
        'Feedback loops that shape better products and services',
        'Clear answers, realistic timelines and proactive updates',
      ],
      action: { label: 'Talk to our team', to: ROUTES.contact },
    },
    {
      id: 'operations',
      tabLabel: 'Operational excellence',
      icon: 'shieldcheck',
      title: 'Operational Excellence',
      body: 'Our cGMP-aligned facilities and modern equipment support repeatable, auditable production. We measure delivery in full and on time, and we improve our quality systems continuously rather than only ahead of an audit.',
      bullets: [
        'cGMP-aligned facilities and documented processes',
        'Delivery-in-full, on-time discipline across every project',
        'Continuous quality-system review and improvement',
        'Integrated lifecycle support with fewer hand-offs',
      ],
      action: { label: 'Explore our services', to: ROUTES.services },
    },
    {
      id: 'partnerships',
      tabLabel: 'Collaborative partnerships',
      icon: 'users',
      title: 'Collaborative Partnerships',
      body: 'One named contact guides your project across our technical, quality and regulatory teams. We work openly with customers, suppliers and regulators, sharing plans, risks and milestones from day one.',
      bullets: [
        'One accountable point of contact for every project',
        'Transparent milestones, risks and decision logs',
        'Shared problem-solving with customers and regulators',
        'Long-term partnerships built on evidence, not promises',
      ],
      action: { label: 'Meet our experts', to: ROUTES.experts },
    },
    {
      id: 'people',
      tabLabel: 'People & culture',
      icon: 'award',
      title: 'People & Culture',
      body: 'We invest in the scientists, engineers and operators who protect patient safety. Diverse skills, open challenge and continuous training keep GMP discipline practical and lived — not just written down.',
      bullets: [
        'Continuous GMP and technical training for every team',
        'Open challenge and diverse perspectives in decisions',
        'Care for the health and wellbeing of our people',
        'Community impact that reaches beyond the factory gate',
      ],
      action: { label: 'Meet the team', to: ROUTES.team },
    },
  ],
}

export const CTA = {
  image: IMAGES.production,
  eyebrow: 'Want to find out more?',
  title: 'Let’s build the next chapter of healthcare together',
  body: 'Talk to our team about bespoke end-to-end CDMO support for your complete drug lifecycle — from formulation and registration to manufacturing and distribution, at any scale.',
  primary: { label: 'Get in touch', to: ROUTES.contact },
  secondary: { label: 'Book a consultation', to: ROUTES.book },
  tertiary: { label: 'Explore our science', to: ROUTES.science },
  assurances: ['GMP-aligned facility', 'PPB registered', 'Senior specialists', 'East Africa'],
}
