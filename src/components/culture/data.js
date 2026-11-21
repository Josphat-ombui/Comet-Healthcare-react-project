// Editorial content for the Our Culture page.
// The section architecture follows CordenPharma's culture page, while every
// line of copy is rewritten around Comet Healthcare's people, standards and
// East African manufacturing context. Photography is drawn from the project's
// own compressed photo library.

import { ROUTES } from '../../lib/navigation.js'
import { DEFAULT_MEDIA, photoSrc } from '../../lib/media.js'

export function getImages(media = DEFAULT_MEDIA) {
  return {
    hero: photoSrc(media, 'culture.hero'),
    peopleVision: photoSrc(media, 'culture.hero'),
    culture: photoSrc(media, 'culture.facility'),
    teamwork: photoSrc(media, 'culture.teamwork'),
    focus: photoSrc(media, 'culture.work'),
    cta: photoSrc(media, 'culture.facility'),
    training: photoSrc(media, 'site.training'),
    community: photoSrc(media, 'site.community'),
  }
}

export const IMAGES = getImages()

export const SEO = {
  title: 'Our Culture',
  description:
    'Meet the culture behind Comet Healthcare: accountable, collaborative and quality-obsessed people building affordable medicines for Kenya and East Africa.',
}

export const HERO = {
  eyebrow: 'About Comet · Our Culture',
  title: 'Our Culture',
  lead: 'Quality is a system. Culture is what makes that system work when no one is watching. Ours is built by people who take ownership, share knowledge and care deeply about the patients at the end of every batch.',
}

export const SECTIONS = [
  { id: 'people-vision', label: 'People vision' },
  { id: 'culture', label: 'Culture matters' },
  { id: 'focus', label: 'Our focus' },
  { id: 'values', label: 'Our values' },
  { id: 'people', label: 'Our people' },
  { id: 'next', label: 'Work with us' },
]

export const PEOPLE_VISION = {
  eyebrow: 'Our people vision',
  title: 'Excellence shared. Impact multiplied.',
  quote: 'We strive for excellence, share our passion and make a difference in patients’ lives — together.',
  paragraphs: [
    'Our people vision is simple: bring skilled, committed people together around a clear purpose and give them the trust to do their best work. From formulation scientists and QA specialists to production operators and warehouse teams, every role protects the same promise — safe, effective medicine that reaches the people who need it.',
    'We celebrate discipline and we celebrate initiative. We want colleagues who ask better questions, challenge respectfully and improve the way we work, because continuous improvement is how a twenty-year-old company stays relevant.',
  ],
  image: IMAGES.peopleVision,
  imageAlt: 'Comet Healthcare manufacturing team at work',
  stats: [
    { value: '20+', label: 'Years of shared practice' },
    { value: '100+', label: 'People across our teams' },
    { value: '5', label: 'Values we live by' },
    { value: '1', label: 'Shared patient promise' },
  ],
  primary: { label: 'Meet our team', to: ROUTES.team },
  secondary: { label: 'Read our purpose', to: ROUTES.purpose },
}

export const CULTURE = {
  eyebrow: 'Culture matters',
  title: 'A workplace where people and purpose grow together',
  lead: 'Welcome to a culture shaped by openness, responsibility and the belief that excellent medicines begin with excellent teams.',
  paragraphs: [
    'We work in a regulated industry where precision is non-negotiable. But the strongest quality system in the world still depends on people who speak up, document honestly and look out for one another. That is the culture we deliberately build at Comet Healthcare.',
    'We embrace different backgrounds and perspectives because better decisions are made when more voices are heard. We give our teams room to own their work, learn new skills and progress — while staying accountable for safety, quality and the commitments we make to partners.',
  ],
  image: IMAGES.culture,
  imageAlt: 'Comet Healthcare facility where our teams work together',
  secondaryImage: IMAGES.training,
  secondaryImageAlt: 'Comet Healthcare team training and knowledge sharing',
  commitments: [
    { icon: 'users', title: 'Inclusive by design', desc: 'Different perspectives, one shared standard of care.' },
    { icon: 'shieldcheck', title: 'Accountable always', desc: 'Own the outcome, close the loop, leave a clear record.' },
    { icon: 'grad', title: 'Growing every day', desc: 'Continuous training and honest feedback for every team.' },
  ],
  badge: 'Open minds. High standards. Real impact.',
}

export const FOCUS = {
  eyebrow: 'Our focus',
  title: 'What we build, every day',
  lead: 'Five priorities turn our people vision into behaviours partners can see and colleagues can feel.',
  image: IMAGES.focus,
  imageAlt: 'Quality-focused production work at Comet Healthcare',
  items: [
    {
      id: 'leadership',
      tabLabel: 'Excellent leadership',
      icon: 'award',
      title: 'Excellent Leadership',
      body: 'Our leaders set the standard for safety, quality and integrity. They create an environment where people feel recognised, heard and proud of the work they do — and where problems are solved close to the source.',
      bullets: [
        'Visible, approachable leadership on the factory floor',
        'Clear priorities and decisions people can understand',
        'Recognition that is specific, timely and fair',
        'Safety and quality modelled from the top down',
      ],
      action: { label: 'Meet our experts', to: ROUTES.experts },
    },
    {
      id: 'brand',
      tabLabel: 'Employer brand',
      icon: 'star',
      title: 'A Place People Are Proud To Work',
      body: 'We want every job at Comet to matter visibly — to the product, to the partner and to the patient. When people can see the contribution they make, pride follows naturally.',
      bullets: [
        'Every role connected to a clear patient outcome',
        'Open communication about wins and challenges',
        'Teams celebrated across departments, not in silos',
        'A reputation built on competence and character',
      ],
      action: { label: 'See our purpose', to: ROUTES.purpose },
    },
    {
      id: 'growth',
      tabLabel: 'Growth & development',
      icon: 'grad',
      title: 'Growth & Development',
      body: 'We invest in the scientist, engineer, operator and specialist in every colleague. Structured GMP training, mentoring and honest feedback help people build careers — not just fill roles.',
      bullets: [
        'Continuous GMP and technical training',
        'Mentoring from senior specialists across teams',
        'Stretch projects that build real capability',
        'Feedback that is direct, useful and acted on',
      ],
      action: { label: 'Explore our science', to: ROUTES.science },
    },
    {
      id: 'responsibility',
      tabLabel: 'Sustainability',
      icon: 'globe',
      title: 'Sustainability & Responsibility',
      body: 'We hold ourselves to high ethical standards and practical responsibility — for our workforce, our community and the environment around our Machakos facility. Access to medicine should not come at the expense of the people who make it.',
      bullets: [
        'Ethical sourcing and transparent labour practices',
        'Care for colleague health, safety and wellbeing',
        'Community engagement beyond the factory gate',
        'Waste, energy and resource discipline in daily operations',
      ],
      action: { label: 'See our community work', to: ROUTES.purpose },
    },
    {
      id: 'digitisation',
      tabLabel: 'Digitisation',
      icon: 'trend',
      title: 'Digitisation & Reporting',
      body: 'Clear data makes better decisions. We use structured reporting and practical digital tools to simplify processes, improve traceability and give teams the information they need to act quickly.',
      bullets: [
        'Transparent reporting across projects and quality systems',
        'Digital records that strengthen traceability',
        'Simpler, scalable processes for partners and teams',
        'Metrics used for learning, not blame',
      ],
      action: { label: 'Talk to our team', to: ROUTES.contact },
    },
  ],
}

export const VALUES = {
  eyebrow: 'Our values',
  title: 'How we show up for each other',
  lead: 'These are the behaviours that turn a group of skilled individuals into a team our partners and patients can trust.',
  items: [
    {
      icon: 'clipboard',
      title: 'Accountability',
      desc: 'We own our actions and our results, keep clear records and close the loop when something needs to change.',
    },
    {
      icon: 'users',
      title: 'Collaboration',
      desc: 'We listen, share expertise and celebrate success together across functions, sites and disciplines.',
    },
    {
      icon: 'shieldcheck',
      title: 'Integrity',
      desc: 'We are honest with each other and our partners, and we do the right thing even when it is difficult.',
    },
    {
      icon: 'heart',
      title: 'Trust',
      desc: 'We back each other’s judgement, make clear commitments and earn confidence through consistent delivery.',
    },
    {
      icon: 'clock',
      title: 'Reliability',
      desc: 'We do what we said we would do — safely, on time and to the standard our patients deserve.',
    },
  ],
}

export const PEOPLE = {
  eyebrow: 'Our people',
  title: 'The specialists shaping our culture',
  lead: 'A glimpse of the leaders who keep quality, delivery and development moving every day.',
  members: [
    {
      name: 'Dr. George Wafula',
      role: 'Quality Assurance Manager',
      image: photoSrc(DEFAULT_MEDIA, 'team.georgeWafula'),
      quote: 'Quality is a daily practice, not a department.',
      to: ROUTES.team,
    },
    {
      name: 'Mr. Julius Mala',
      role: 'Production Manager',
      image: photoSrc(DEFAULT_MEDIA, 'team.juliusMala'),
      quote: 'Precision on the floor is patient care in action.',
      to: ROUTES.team,
    },
    {
      name: 'Mr. Bramwel Wambua',
      role: 'Quality Control Manager',
      image: photoSrc(DEFAULT_MEDIA, 'team.bramwelWambua'),
      quote: 'Every result we release has a person behind it.',
      to: ROUTES.team,
    },
    {
      name: 'Eng. Josphat Ombui',
      role: 'Facilities & Equipment Manager',
      image: photoSrc(DEFAULT_MEDIA, 'team.josphatOmbui'),
      quote: 'Reliable systems let people focus on excellence.',
      to: ROUTES.team,
    },
  ],
  cta: { label: 'Meet the full team', to: ROUTES.team },
}

export const CTA = {
  image: IMAGES.cta,
  eyebrow: 'Want to find out more?',
  title: 'Build something meaningful with us',
  body: 'Talk to our team about bespoke end-to-end CDMO support for your complete drug lifecycle — from formulation and registration to manufacturing and distribution, at any scale.',
  primary: { label: 'Get in touch', to: ROUTES.contact },
  secondary: { label: 'Book a consultation', to: ROUTES.book },
  tertiary: { label: 'Meet our team', to: ROUTES.team },
  assurances: ['GMP-aligned facility', 'PPB registered', 'Senior specialists', 'East Africa'],
}
