// Comet Site CMS — server-owned content model.
//
// Every piece of marketing text + every photo on the site lives in this
// default tree. The editable copy is stored in the Setting table
// ("site_content") and is DEEP-MERGED over these defaults on read, so an
// admin edit updates the live site without touching code. Arrays (photo
// sliders, section lists) are replaced wholesale by an override; scalars and
// nested objects merge field-by-field.
//
// The admin "Content Studio" writes /api/admin/content with a JSON body —
// it may be a full tree or a partial; missing branches fall through to the
// defaults below.

import { DEFAULT_MEDIA, gallery, photoSrc, photoWebp } from '../../src/lib/media.js'

const G = gallery

// Curated from the client photo pool (photos/compressjpeg, ~20MP DSLR shots).
// Landscape masters for full-bleed heroes, spread across shoots for variety.
const HERO_SLIDES = [
  { image: G('DSC_3017.jpg'), alt: 'Comet Healthcare manufacturing facility' },
  { image: G('DSC_0481.jpg'), alt: 'Pharmaceutical production line' },
  { image: G('DSC_2989.jpg'), alt: 'Quality control laboratory' },
  { image: G('DSC_3122.jpg'), alt: 'Pharmaceutical packaging area' },
  { image: G('DSC_3234.jpg'), alt: 'Laboratory research and testing' },
  { image: G('DSC_3275.jpg'), alt: 'Analytical instruments in the QC lab' },
  { image: G('DSC_2897.jpg'), alt: 'Pharmaceutical facility exterior' },
  { image: G('DSC_3348.jpg'), alt: 'Manufacturing operations' },
  { image: G('DSC_3434.jpg'), alt: 'Tablet production and finish' },
  { image: G('DSC_3513.jpg'), alt: 'GMP production environment' },
]

const PRODUCT_GALLERY = [
  { image: G('DSC_0475.jpg'), alt: 'Comet Healthcare product 1' },
  { image: G('DSC_0481.jpg'), alt: 'Comet Healthcare product 2' },
  { image: G('DSC_2897.jpg'), alt: 'Comet Healthcare product 3' },
  { image: G('DSC_2997.jpg'), alt: 'Comet Healthcare product 4' },
  { image: G('DSC_3000.jpg'), alt: 'Comet Healthcare product 5' },
  { image: G('DSC_3004.jpg'), alt: 'Comet Healthcare product 6' },
  { image: G('DSC_3007.jpg'), alt: 'Comet Healthcare product 7' },
  { image: G('DSC_3009.jpg'), alt: 'Comet Healthcare product 8' },
  { image: G('DSC_3014.jpg'), alt: 'Comet Healthcare product 9' },
  { image: G('DSC_3021.jpg'), alt: 'Comet Healthcare product 10' },
  { image: G('DSC_3119.jpg'), alt: 'Comet Healthcare product 11' },
  { image: G('DSC_3135.jpg'), alt: 'Comet Healthcare product 12' },
  { image: G('DSC_3147.jpg'), alt: 'Comet Healthcare product 13' },
  { image: G('DSC_3159.jpg'), alt: 'Comet Healthcare product 14' },
  { image: G('DSC_3165.jpg'), alt: 'Comet Healthcare product 15' },
  { image: G('DSC_3177.jpg'), alt: 'Comet Healthcare product 16' },
  { image: G('DSC_3189.jpg'), alt: 'Comet Healthcare product 17' },
  { image: G('DSC_3197.jpg'), alt: 'Comet Healthcare product 18' },
  { image: G('DSC_3205.jpg'), alt: 'Comet Healthcare product 19' },
  { image: G('DSC_3219.jpg'), alt: 'Comet Healthcare product 20' },
  { image: G('DSC_3232.jpg'), alt: 'Comet Healthcare product 21' },
  { image: G('DSC_3259.jpg'), alt: 'Comet Healthcare product 22' },
  { image: G('DSC_3280.jpg'), alt: 'Comet Healthcare product 23' },
  { image: G('DSC_3304.jpg'), alt: 'Comet Healthcare product 24' },
  { image: G('DSC_3317.jpg'), alt: 'Comet Healthcare product 25' },
  { image: G('DSC_3333.jpg'), alt: 'Comet Healthcare product 26' },
  { image: G('DSC_3358.jpg'), alt: 'Comet Healthcare product 27' },
  { image: G('DSC_3367.jpg'), alt: 'Comet Healthcare product 28' },
  { image: G('DSC_3388.jpg'), alt: 'Comet Healthcare product 29' },
  { image: G('DSC_3456.jpg'), alt: 'Comet Healthcare product 30' },
]

export const DEFAULT_SITE_CONTENT = {
  global: {
    brand: 'Comet Healthcare',
    tagline: "Kenya's Premier Pharmaceutical Manufacturer",
    email: 'info@comethealthcare.com',
    phone: '+254 725 519 844',
    address: 'Machakos, Kenya',
    hours: 'Mon–Fri 8:00am – 5:00pm EAT',
  },
  // Shared photo registry. Content Studio → Shared photos edits these entries;
  // every page and the provider seed resolves images through the same keys.
  media: DEFAULT_MEDIA,
  home: {
    hero: {
      badge: "Kenya's Premier Pharmaceutical Manufacturer",
      title: 'Expert guidance for the journey from',
      highlight: 'molecule to market',
      sub: 'Comet Healthcare combines 20+ years of GMP manufacturing with senior scientific consultation — so you can book direct advice from the people who build, register and qualify medicines across East Africa.',
      stats: [
        { value: '20+', label: 'Years Experience' },
        { value: '14+', label: 'Products' },
        { value: '100%', label: 'Quality Assured' },
      ],
      slides: HERO_SLIDES,
      badges: ['PPB Certified', 'GMP Compliant', 'Kenya · East Africa', '20+ Years'],
    },
    valueProps: {
      eyebrow: 'What We Offer',
      title: 'One partner through the entire drug lifecycle',
      lead: 'From pre-formulation to post-market surveillance, our senior specialists accelerate timelines and de-risk your programme at every stage.',
      items: [
        { icon: 'flask', title: 'CDMO & Contract Manufacturing', desc: 'End-to-end support from formulation and scale-up to packaging — one accountable partner for the whole drug lifecycle.' },
        { icon: 'file', title: 'Regulatory & Registration', desc: 'Dossier preparation, product registration and renewal across East Africa, navigated by people who do it daily.' },
        { icon: 'shield', title: 'Quality Assurance & GMP', desc: 'Batch testing, SOPs, supplier verification and internal audits built on cGMP discipline we have practised for 20+ years.' },
        { icon: 'grad', title: 'Training & Digital Health', desc: 'Practical programs for healthcare professionals and startups — regulatory compliance, digital tools and leadership.' },
      ],
    },
    experts: {
      eyebrow: 'Our Experts',
      title: 'Book time with the people behind the product',
      lead: 'Senior pharmacists, scientists and regulatory specialists — available for direct consultation.',
    },
    howItWorks: {
      eyebrow: 'How it works',
      title: 'Book a consultation in three steps',
      lead: 'Real availability, instant confirmation, no phone tag. Manage everything from your client portal.',
      steps: [
        { step: '01', icon: 'bell', title: 'Choose an expert', desc: 'Browse our directory of senior specialists — regulatory, CDMO, quality, training and business development.' },
        { step: '02', icon: 'calendar', title: 'Pick a time that works', desc: 'See real availability and book in under a minute. No calls, no back-and-forth emails.' },
        { step: '03', icon: 'clipboard', title: 'Meet & move forward', desc: 'Get a clear action plan, then track your inquiry and consultations from your client portal.' },
      ],
    },
    testimonials: {
      eyebrow: 'Client Stories',
      title: 'Trusted by facilities, distributors and partners',
      lead: 'Real feedback from hospital systems, wholesalers and innovators we work with across the region.',
    },
  },
  products: {
    hero: {
      eyebrow: 'Our Portfolio',
      title: 'Products built on 20 years of GMP discipline',
      lead: 'A curated portfolio of medications that combine scientific innovation with proven therapeutic value — every batch quality-assured.',
    },
    gallery: {
      eyebrow: 'Product Showcase',
      title: 'Browse the range',
      lead: 'Quality-assured formulations across our registered product lines.',
      items: PRODUCT_GALLERY,
    },
    services: {
      eyebrow: 'Our Offerings',
      title: 'Beyond the products',
      items: [
        { icon: 'shield', title: 'Quality Assurance & GMP Compliance', desc: 'Every product meets Kenyan and international standards through batch testing, SOP development, supplier verification and continuous improvement.' },
        { icon: 'file', title: 'Regulatory Affairs & Product Registration', desc: 'Full PPB compliance through dossier preparation, product registration and renewals — regional pathways included.' },
        { icon: 'trend', title: 'Affordable Access Initiatives', desc: 'Collaboration with county health facilities and NGOs to keep essential medicines accessible and affordable.' },
        { icon: 'package', title: 'Contract Manufacturing (CDMO)', desc: 'Bespoke end-to-end CDMO support for your complete drug lifecycle at any scale.' },
      ],
    },
    catalogue: {
      eyebrow: 'Request a Catalogue',
      title: 'New customer?',
      lead: 'Request our distributor catalogue and price list. Bulk ordering, county facility supply and NGO partnerships all start with the same conversation.',
    },
  },
  about: {
    hero: { eyebrow: 'About Us', title: 'About Comet Healthcare', lead: 'Building a distinguished reputation and gaining extensive experience over 20 years of pharmaceutical excellence in Kenya and East Africa.' },
    story: {
      eyebrow: 'Our Story',
      title: 'Leading Pharmaceutical Manufacturer in Kenya & East Africa',
      paragraphs: [
        'Comet Healthcare Ltd has built a distinguished reputation and gained extensive experience over the last 20 years. Our purpose is to bridge the gaps that limit access to essential medicines and healthcare support in Kenya.',
        'We are a manufacturer of generic and brand pharmaceuticals with a mission to provide high quality, safe, efficacious, and cost-effective medicines to alleviate global health challenges.',
        'Our dedicated team continuously works to develop innovative pharmaceutical solutions that address the evolving healthcare needs of our communities. We invest in research to improve existing formulations and create new treatment options that are both effective and accessible.',
      ],
      image: photoSrc(DEFAULT_MEDIA, 'site.pharma'),
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
        { year: '2010', title: 'PPB Licensed', desc: "Received full manufacturing and distribution licenses from Kenya's Pharmacy and Poisons Board." },
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
  },
  mission: {
    seo: {
      title: 'Our Mission & Vision',
      description: 'Comet Healthcare exists to close the gap between scientific possibility and affordable, reliable medicine — building a pharmaceutical partner Kenya and East Africa can trust.',
    },
    hero: {
      eyebrow: 'About Comet · Mission & Vision',
      title: 'Our Mission & Vision',
      lead: 'We go beyond manufacturing medicines. We exist to close the gap between scientific possibility and affordable, reliable healthcare — building a pharmaceutical partner Kenya and East Africa can trust.',
    },
    mission: {
      eyebrow: 'Our Mission',
      title: 'Better medicines, built around real patient needs',
      lead: 'To address real medical needs through world-class pharmaceutical manufacturing — combining rigorous science, resilient supply and genuine care for the people behind every prescription.',
      paragraphs: [
        'We manufacture quality, affordable generics and specialty medicines to recognised cGMP standards, supporting healthcare providers from the first dossier to the last mile of delivery.',
        'Our teams invest in research and formulation improvement so existing therapies become safer, more accessible and better suited to the communities we serve. Innovation only matters when it reaches the people who need it.',
        'Every batch is tested, documented and released with the same discipline. For us, reliability is not a claim made in a brochure — it is a daily practice on the factory floor, in the lab and in every partnership we hold.',
      ],
      image: photoSrc(DEFAULT_MEDIA, 'mission.gmp'),
      imageAlt: 'GMP-compliant production environment at Comet Healthcare',
      stats: [
        { value: '20+', label: 'Years of practice' },
        { value: 'PPB', label: 'Registered operations' },
        { value: '14+', label: 'Products supported' },
        { value: '100%', label: 'Batch quality tested' },
      ],
    },
    vision: {
      eyebrow: 'Our Vision',
      title: 'To be the CDMO partner East Africa can rely on',
      lead: 'A trusted, transparent and highly capable pharmaceutical partner — known for integrated solutions, uncompromising quality and the confidence to deliver at any scale.',
      paragraphs: [
        'We envision Comet Healthcare as the first choice for manufacturers and health systems seeking end-to-end support across formulation, registration, manufacturing and distribution.',
        'Our ambition is to make advanced pharmaceutical capability local: close to patients, responsive to partners and resilient enough to serve the wider region.',
        'We measure progress not only by output, but by the trust we earn — with regulators, customers, colleagues and the communities whose health depends on our work.',
      ],
      image: photoSrc(DEFAULT_MEDIA, 'mission.facility'),
      imageAlt: 'Comet Healthcare pharmaceutical facility in Machakos, Kenya',
      quote: 'Trusted locally. Built to global standards.',
      pillars: [
        { title: 'Integrated capability', desc: 'Formulation, manufacturing, quality and registration under one accountable roof.' },
        { title: 'Transparent partnership', desc: 'Clear plans, shared risks and direct access to the people making decisions.' },
        { title: 'Regional resilience', desc: 'Supply systems designed for East Africa, not exported as an afterthought.' },
      ],
    },
    values: {
      eyebrow: 'Our Values',
      title: 'The standards we hold ourselves to',
      lead: 'Our values are not wall art. They are the behaviours that keep medicines safe, partners confident and patients protected.',
      items: [
        { icon: 'clipboard', title: 'Accountability', desc: 'We own our actions and our outcomes — from a deviated batch to a delayed shipment — and we close the loop with evidence.' },
        { icon: 'users', title: 'Collaboration', desc: 'We bring scientists, operators, quality specialists and customers into the same conversation early, because better decisions are shared decisions.' },
        { icon: 'shieldcheck', title: 'Integrity', desc: 'We are honest with each other and our partners, keep transparent records and do the right thing even when no one is watching.' },
        { icon: 'heart', title: 'Trust', desc: 'We earn confidence by making clear commitments and then meeting them — batch after batch, project after project.' },
        { icon: 'clock', title: 'Reliability', desc: 'We deliver consistently so our customers, their patients and our communities can plan around us with certainty.' },
      ],
    },
    focus: {
      eyebrow: 'How we deliver',
      title: 'What our mission looks like in practice',
      lead: 'Four disciplines turn a stated ambition into outcomes partners can measure.',
      image: photoSrc(DEFAULT_MEDIA, 'mission.quality'),
      imageAlt: 'Analytical instruments in the Comet Healthcare quality control laboratory',
      items: [
        { id: 'customer', tabLabel: 'Customer centricity', icon: 'heart', title: 'Customer Centricity & Service', body: 'Every decision starts with the patient and the healthcare professional who depends on us. We anticipate regulatory, formulation and supply needs before they become delays, and we give partners direct access to senior specialists.', bullets: ['Patient-first decisions in formulation, packaging and supply', 'Direct access to senior technical and regulatory specialists', 'Feedback loops that shape better products and services', 'Clear answers, realistic timelines and proactive updates'], action: { label: 'Talk to our team', to: '/contact' } },
        { id: 'operations', tabLabel: 'Operational excellence', icon: 'shieldcheck', title: 'Operational Excellence', body: 'Our cGMP-aligned facilities and modern equipment support repeatable, auditable production. We measure delivery in full and on time, and we improve our quality systems continuously rather than only ahead of an audit.', bullets: ['cGMP-aligned facilities and documented processes', 'Delivery-in-full, on-time discipline across every project', 'Continuous quality-system review and improvement', 'Integrated lifecycle support with fewer hand-offs'], action: { label: 'Explore our services', to: '/services' } },
        { id: 'partnerships', tabLabel: 'Collaborative partnerships', icon: 'users', title: 'Collaborative Partnerships', body: 'One named contact guides your project across our technical, quality and regulatory teams. We work openly with customers, suppliers and regulators, sharing plans, risks and milestones from day one.', bullets: ['One accountable point of contact for every project', 'Transparent milestones, risks and decision logs', 'Shared problem-solving with customers and regulators', 'Long-term partnerships built on evidence, not promises'], action: { label: 'Meet our experts', to: '/experts' } },
        { id: 'people', tabLabel: 'People & culture', icon: 'award', title: 'People & Culture', body: 'We invest in the scientists, engineers and operators who protect patient safety. Diverse skills, open challenge and continuous training keep GMP discipline practical and lived — not just written down.', bullets: ['Continuous GMP and technical training for every team', 'Open challenge and diverse perspectives in decisions', 'Care for the health and wellbeing of our people', 'Community impact that reaches beyond the factory gate'], action: { label: 'Meet the team', to: '/team' } },
      ],
    },
    cta: {
      image: photoSrc(DEFAULT_MEDIA, 'mission.production'),
      eyebrow: 'Want to find out more?',
      title: 'Let’s build the next chapter of healthcare together',
      body: 'Talk to our team about bespoke end-to-end CDMO support for your complete drug lifecycle — from formulation and registration to manufacturing and distribution, at any scale.',
      primary: { label: 'Get in touch', to: '/contact' },
      secondary: { label: 'Book a consultation', to: '/book' },
      tertiary: { label: 'Explore our science', to: '/science' },
      assurances: ['GMP-aligned facility', 'PPB registered', 'Senior specialists', 'East Africa'],
    },
  },
  culture: {
    seo: {
      title: 'Our Culture',
      description: 'Meet the culture behind Comet Healthcare: accountable, collaborative and quality-obsessed people building affordable medicines for Kenya and East Africa.',
    },
    hero: {
      eyebrow: 'About Comet · Our Culture',
      title: 'Our Culture',
      lead: 'Quality is a system. Culture is what makes that system work when no one is watching. Ours is built by people who take ownership, share knowledge and care deeply about the patients at the end of every batch.',
    },
    peopleVision: {
      eyebrow: 'Our people vision',
      title: 'Excellence shared. Impact multiplied.',
      quote: 'We strive for excellence, share our passion and make a difference in patients’ lives — together.',
      paragraphs: [
        'Our people vision is simple: bring skilled, committed people together around a clear purpose and give them the trust to do their best work. From formulation scientists and QA specialists to production operators and warehouse teams, every role protects the same promise — safe, effective medicine that reaches the people who need it.',
        'We celebrate discipline and we celebrate initiative. We want colleagues who ask better questions, challenge respectfully and improve the way we work, because continuous improvement is how a twenty-year-old company stays relevant.',
      ],
      image: photoSrc(DEFAULT_MEDIA, 'culture.hero'),
      imageAlt: 'Comet Healthcare manufacturing team at work',
      stats: [
        { value: '20+', label: 'Years of shared practice' },
        { value: '100+', label: 'People across our teams' },
        { value: '5', label: 'Values we live by' },
        { value: '1', label: 'Shared patient promise' },
      ],
      primary: { label: 'Meet our team', to: '/team' },
      secondary: { label: 'Read our purpose', to: '/our-purpose' },
    },
    culture: {
      eyebrow: 'Culture matters',
      title: 'A workplace where people and purpose grow together',
      lead: 'Welcome to a culture shaped by openness, responsibility and the belief that excellent medicines begin with excellent teams.',
      paragraphs: [
        'We work in a regulated industry where precision is non-negotiable. But the strongest quality system in the world still depends on people who speak up, document honestly and look out for one another. That is the culture we deliberately build at Comet Healthcare.',
        'We embrace different backgrounds and perspectives because better decisions are made when more voices are heard. We give our teams room to own their work, learn new skills and progress — while staying accountable for safety, quality and the commitments we make to partners.',
      ],
      image: photoSrc(DEFAULT_MEDIA, 'culture.facility'),
      imageAlt: 'Comet Healthcare facility where our teams work together',
      secondaryImage: photoSrc(DEFAULT_MEDIA, 'site.training'),
      secondaryImageAlt: 'Comet Healthcare team training and knowledge sharing',
      commitments: [
        { icon: 'users', title: 'Inclusive by design', desc: 'Different perspectives, one shared standard of care.' },
        { icon: 'shieldcheck', title: 'Accountable always', desc: 'Own the outcome, close the loop, leave a clear record.' },
        { icon: 'grad', title: 'Growing every day', desc: 'Continuous training and honest feedback for every team.' },
      ],
      badge: 'Open minds. High standards. Real impact.',
    },
    focus: {
      eyebrow: 'Our focus',
      title: 'What we build, every day',
      lead: 'Five priorities turn our people vision into behaviours partners can see and colleagues can feel.',
      image: photoSrc(DEFAULT_MEDIA, 'culture.work'),
      imageAlt: 'Quality-focused production work at Comet Healthcare',
      items: [
        { id: 'leadership', tabLabel: 'Excellent leadership', icon: 'award', title: 'Excellent Leadership', body: 'Our leaders set the standard for safety, quality and integrity. They create an environment where people feel recognised, heard and proud of the work they do — and where problems are solved close to the source.', bullets: ['Visible, approachable leadership on the factory floor', 'Clear priorities and decisions people can understand', 'Recognition that is specific, timely and fair', 'Safety and quality modelled from the top down'], action: { label: 'Meet our experts', to: '/experts' } },
        { id: 'brand', tabLabel: 'Employer brand', icon: 'star', title: 'A Place People Are Proud To Work', body: 'We want every job at Comet to matter visibly — to the product, to the partner and to the patient. When people can see the contribution they make, pride follows naturally.', bullets: ['Every role connected to a clear patient outcome', 'Open communication about wins and challenges', 'Teams celebrated across departments, not in silos', 'A reputation built on competence and character'], action: { label: 'See our purpose', to: '/our-purpose' } },
        { id: 'growth', tabLabel: 'Growth & development', icon: 'grad', title: 'Growth & Development', body: 'We invest in the scientist, engineer, operator and specialist in every colleague. Structured GMP training, mentoring and honest feedback help people build careers — not just fill roles.', bullets: ['Continuous GMP and technical training', 'Mentoring from senior specialists across teams', 'Stretch projects that build real capability', 'Feedback that is direct, useful and acted on'], action: { label: 'Explore our science', to: '/science' } },
        { id: 'responsibility', tabLabel: 'Sustainability', icon: 'globe', title: 'Sustainability & Responsibility', body: 'We hold ourselves to high ethical standards and practical responsibility — for our workforce, our community and the environment around our Machakos facility. Access to medicine should not come at the expense of the people who make it.', bullets: ['Ethical sourcing and transparent labour practices', 'Care for colleague health, safety and wellbeing', 'Community engagement beyond the factory gate', 'Waste, energy and resource discipline in daily operations'], action: { label: 'See our community work', to: '/our-purpose' } },
        { id: 'digitisation', tabLabel: 'Digitisation', icon: 'trend', title: 'Digitisation & Reporting', body: 'Clear data makes better decisions. We use structured reporting and practical digital tools to simplify processes, improve traceability and give teams the information they need to act quickly.', bullets: ['Transparent reporting across projects and quality systems', 'Digital records that strengthen traceability', 'Simpler, scalable processes for partners and teams', 'Metrics used for learning, not blame'], action: { label: 'Talk to our team', to: '/contact' } },
      ],
    },
    values: {
      eyebrow: 'Our values',
      title: 'How we show up for each other',
      lead: 'These are the behaviours that turn a group of skilled individuals into a team our partners and patients can trust.',
      items: [
        { icon: 'clipboard', title: 'Accountability', desc: 'We own our actions and our results, keep clear records and close the loop when something needs to change.' },
        { icon: 'users', title: 'Collaboration', desc: 'We listen, share expertise and celebrate success together across functions, sites and disciplines.' },
        { icon: 'shieldcheck', title: 'Integrity', desc: 'We are honest with each other and our partners, and we do the right thing even when it is difficult.' },
        { icon: 'heart', title: 'Trust', desc: 'We back each other’s judgement, make clear commitments and earn confidence through consistent delivery.' },
        { icon: 'clock', title: 'Reliability', desc: 'We do what we said we would do — safely, on time and to the standard our patients deserve.' },
      ],
    },
    people: {
      eyebrow: 'Our people',
      title: 'The specialists shaping our culture',
      lead: 'A glimpse of the leaders who keep quality, delivery and development moving every day.',
      members: [
        { name: 'Dr. George Wafula', role: 'Quality Assurance Manager', image: photoSrc(DEFAULT_MEDIA, 'team.georgeWafula'), quote: 'Quality is a daily practice, not a department.', to: '/team' },
        { name: 'Mr. Julius Mala', role: 'Production Manager', image: photoSrc(DEFAULT_MEDIA, 'team.juliusMala'), quote: 'Precision on the floor is patient care in action.', to: '/team' },
        { name: 'Mr. Bramwel Wambua', role: 'Quality Control Manager', image: photoSrc(DEFAULT_MEDIA, 'team.bramwelWambua'), quote: 'Every result we release has a person behind it.', to: '/team' },
        { name: 'Eng. Josphat Ombui', role: 'Facilities & Equipment Manager', image: photoSrc(DEFAULT_MEDIA, 'team.josphatOmbui'), quote: 'Reliable systems let people focus on excellence.', to: '/team' },
      ],
      cta: { label: 'Meet the full team', to: '/team' },
    },
    cta: {
      image: photoSrc(DEFAULT_MEDIA, 'culture.facility'),
      eyebrow: 'Want to find out more?',
      title: 'Build something meaningful with us',
      body: 'Talk to our team about bespoke end-to-end CDMO support for your complete drug lifecycle — from formulation and registration to manufacturing and distribution, at any scale.',
      primary: { label: 'Get in touch', to: '/contact' },
      secondary: { label: 'Book a consultation', to: '/book' },
      tertiary: { label: 'Meet our team', to: '/team' },
      assurances: ['GMP-aligned facility', 'PPB registered', 'Senior specialists', 'East Africa'],
    },
  },
  purpose: {
    seo: {
      title: 'Our Purpose',
      description: 'Comet Healthcare exists to restore hope and expand access to quality, affordable medicines across Kenya and East Africa — guided by integrity, excellence and human-centred service.',
    },
    hero: {
      eyebrow: 'Home · Our Purpose',
      title: 'Our Purpose',
      lead: 'We go beyond manufacturing medicines. We are here to restore hope, enable healthier futures and empower communities — because access to quality pharmaceutical care is a right, not a privilege.',
    },
    belief: {
      eyebrow: 'Why we exist',
      title: 'Healthcare is a fundamental human right',
      image: G('DSC_3122.jpg'),
      imageAlt: 'Pharmaceutical packaging and distribution at Comet Healthcare',
      quote: 'Access to quality pharmaceutical care is a right, not a privilege.',
      paragraphs: [
        'At Comet Healthcare, our purpose goes beyond manufacturing medications — we are in the business of restoring hope, enabling healthier futures and empowering communities. This belief drives us to innovate relentlessly, maintain uncompromising quality standards and keep effective, affordable medicines within reach of the people who depend on them.',
        'Behind every prescription is a person seeking better health and a better quality of life. Our patient-centred approach shapes how we formulate, manufacture, register and support every product — from the first dossier to the last mile of delivery.',
      ],
      commitments: ['Quality without compromise', 'Affordable by design', 'Accessible across East Africa'],
      badge: { value: '20+', label: 'Years of pharmaceutical practice' },
    },
    principles: [
      {
        id: 'integrity', number: '01', icon: 'shieldcheck', tabLabel: 'Be guided by integrity',
        title: 'Be guided by integrity', kicker: 'Our non-negotiable compass',
        summary: 'Transparent, accountable and ethical — from the factory floor to after-sales service.',
        body: 'Integrity is our non-negotiable compass. Every process — from pharmaceutical manufacturing to after-sales service — is carried out with transparency and accountability. Regulators, partners and patients can trust that our actions are ethical and our commitments are genuine.',
        proof: 'Documented at every stage — audited batches, traceable records and open communication.',
        image: G('DSC_2989.jpg'), imageAlt: 'Quality control laboratory at Comet Healthcare',
        action: { label: 'About Comet', to: '/about' },
      },
      {
        id: 'excellence', number: '02', icon: 'award', tabLabel: 'Build trust through excellence',
        title: 'Build trust through excellence', kicker: 'Consistent quality, earned daily',
        summary: 'Strict standards in production, compliance and service delivery build partnerships that last.',
        body: 'Trust is earned through consistent quality. We maintain strict standards in production, compliance and service delivery, backed by current Good Manufacturing Practice and the discipline of a 20-year GMP heritage. Every interaction with Comet reinforces reliability and makes excellence the foundation of long-term partnerships.',
        proof: 'PPB-registered operations, cGMP-aligned facilities and batch testing before release.',
        image: G('DSC_3434.jpg'), imageAlt: 'Tablet production and finishing at Comet Healthcare',
        action: { label: 'See our services', to: '/services' },
      },
      {
        id: 'service', number: '03', icon: 'heart', tabLabel: 'Champion human-centred service',
        title: 'Champion human-centred service', kicker: 'People before processes',
        summary: 'Support that continues long after a product leaves our facility.',
        body: 'Patients and communities are at the heart of our work. Beyond products, Comet provides after-sales support that ensures continuity of care. This human-centred approach builds deeper connections with healthcare providers and patients — showing that we value individuals as much as outcomes.',
        proof: 'Responsive regulatory, quality and commercial teams, available when partners need them.',
        image: G('DSC_3234.jpg'), imageAlt: 'Research and testing supporting patient outcomes',
        action: { label: 'Talk to our experts', to: '/experts' },
      },
    ],
    wellbeing: {
      eyebrow: 'Our commitment', title: 'Advance global health & wellbeing',
      paragraphs: [
        'Comet Healthcare exists to improve lives by producing medicines and healthcare solutions that meet international standards. Our focus is not only on treating illness, but also on strengthening prevention and long-term wellbeing.',
        'Every product we deliver is designed to make a measurable difference in patient health outcomes and community resilience — from essential generics at scale to specialised treatments for evolving healthcare needs.',
      ],
      image: G('DSC_3348.jpg'), imageAlt: 'Manufacturing operations supporting healthcare across East Africa',
      imageCaption: 'From Machakos to the region',
      metrics: [
        { value: 20, suffix: '+', label: 'Years of GMP practice', detail: 'Continuous pharmaceutical experience' },
        { value: 14, suffix: '+', label: 'Registered products', detail: 'Supported from dossier to market' },
        { value: 100, suffix: '%', label: 'Batch quality tested', detail: 'Before any product leaves our facility' },
      ],
      badges: ['cGMP aligned', 'PPB registered', 'East African reach'],
      statement: 'Better formulations. Stronger supply chains. Healthier communities.',
    },
    service: {
      eyebrow: 'Human-centred care', title: 'Support that continues after the product',
      lead: 'Access is more than a delivery. We pair reliable products with practical support so healthcare providers can protect continuity of care for the people they serve.',
      items: [
        { icon: 'clipboard', title: 'After-sales support', body: 'Documentation, product information and responsive guidance for the teams prescribing, dispensing and administering our medicines.', to: '/contact', linkLabel: 'Request support' },
        { icon: 'globe', title: 'Continuity of care', body: 'Forecasting, dependable supply and quality systems that keep essential medicines available when and where they are needed.', to: '/products', linkLabel: 'Explore products' },
        { icon: 'users', title: 'Community partnerships', body: 'Collaboration with county health facilities, NGOs and distributors to extend the reach of affordable, quality healthcare.', to: '/services', linkLabel: 'See our work' },
      ],
    },
    people: {
      eyebrow: 'Purpose in practice', title: 'The specialists behind the promise',
      lead: 'Our regulatory, quality, manufacturing and commercial experts turn a stated purpose into outcomes partners can measure.',
      ctaLabel: 'Browse all experts',
    },
    cta: {
      image: photoSrc(DEFAULT_MEDIA, 'site.story'),
      eyebrow: 'Want to find out more?', title: 'Let’s build healthier communities together',
      body: 'Discover how Comet Healthcare can support your healthcare needs with quality medications, competitive pricing and exceptional service. Talk to our team about bespoke end-to-end CDMO support for your complete drug lifecycle — at any scale.',
      primary: { label: 'Get in touch', to: '/contact' },
      secondary: { label: 'Book a consultation', to: '/book' },
      tertiary: { label: 'Explore our products', to: '/products' },
      assurances: ['GMP-certified facility', 'PPB registered', 'Senior specialists', 'East Africa'],
    },
  },
  science: {
    hero: { eyebrow: 'Our Expertise', title: 'Our Science', lead: "The Science and Soul Behind Our Formulations. We don't chase trends—we anticipate them, building formulations that perform under pressure while infusing every product with purpose." },
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
      image: photoSrc(DEFAULT_MEDIA, 'site.lab'),
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
  },
  services: {
    hero: {
      eyebrow: 'What We Offer',
      title: 'Services built for the whole drug lifecycle',
      lead: 'Direct expert consultation layered on 20+ years of GMP manufacturing — so you can move faster with people who have done it before.',
    },
    items: [
      { icon: 'flask', title: 'CDMO & Contract Manufacturing', blurb: 'Bespoke end-to-end development and manufacturing partnerships at any scale.', items: ['Pre-formulation studies & formulation development', 'Scale-up and technology transfer to GMP lines', 'Process optimisation and packaging design', 'Analytical method development & validation'], tag: 'Book a CDMO consultation', slug: 'christopher-musembi' },
      { icon: 'file', title: 'Regulatory Affairs & Registration', blurb: 'Get products registered across East Africa without the guesswork.', items: ['Dossier preparation and submission', 'Product registration and renewals (PPB + EAC)', 'Pharmacopoeia alignment and labelling review', 'Post-approval change management'], tag: 'Book a regulatory consultation', slug: 'dr-peter-asingo' },
      { icon: 'shield', title: 'Quality Assurance & GMP Compliance', blurb: 'Independent quality discipline from batch release to plant readiness.', items: ['Batch testing, release and documentation', 'SOP development and training', 'Supplier and raw-material verification', 'Internal audits & continuous improvement'], tag: 'Book a QA consultation', slug: 'dr-george-wafula' },
      { icon: 'microscope', title: 'R&D & Formulation Science', blurb: 'Scientific problem-solving for solid orals, FDCs and novel formats.', items: ['Pre-formulation and excipient selection', 'Fixed-dose combination development', 'Bioequivalence-driven optimisation', 'Scale-up batch strategy'], tag: 'Book an R&D consultation', slug: 'christopher-musembi' },
      { icon: 'grad', title: 'Training & Digital Health', blurb: 'Practical programs that build capability inside your organisation.', items: ['Regulatory compliance & safety training', 'Digital tools & website security', 'Healthcare branding & communication', 'Leadership & professional growth'], tag: 'Book a training consultation', slug: 'dr-peter-asingo' },
      { icon: 'package', title: 'Pharmaceutical Products & Supply', blurb: 'Affordable, quality-assured medicines for facilities and distributors.', items: ['14+ registered product lines', 'County facility and NGO partnership supply', 'Distributor and stockist programmes', 'Certificate of Analysis with every batch'], tag: 'Request our product catalogue', slug: null },
      { icon: 'trend', title: 'Affordable Access Initiatives', blurb: 'Public-health programmes that make essential medicines reach further.', items: ['Collaboration with county health facilities', 'NGO partnership programs', 'Community health outreach'], tag: 'Talk to partnerships', slug: 'peter-ngossi' },
    ],
  },
  team: {
    hero: { eyebrow: 'Our People', title: 'Our Team', lead: 'Since our founding in 2006, Comet Healthcare has remained committed to transforming every challenge into meaningful progress. Our professional team embodies hope, integrity, and innovation.' },
    members: [
      { name: "Dr. Peter Ochieng' Asingo", role: 'CEO & Founder', bio: 'A career pharmacist endowed with immense experience and practice having served in government at different capacities, and in pharmaceutical supply chain. His leadership advocates strict compliance to cGMP standards with a focus on Safety, Efficacy, and Quality.', email: 'info@comethealthcares.com', image: photoSrc(DEFAULT_MEDIA, 'team.peterAsingo') },
      { name: 'Dr. George Wafula', role: 'Quality Assurance Manager', bio: "With over 15 years of experience in pharmaceutical quality systems, Dr. George Wafula is the precision powerhouse behind Comet Healthcare's uncompromising standards. His expertise spans GMP, ISO protocols, and global regulatory frameworks.", email: 'qualityassurance@comethealthcare.com', image: photoSrc(DEFAULT_MEDIA, 'team.georgeWafula') },
      { name: 'Mr. Bramwel Wambua', role: 'Quality Control Manager', bio: 'With a sharp analytical mind and deep commitment to pharmaceutical standards, Bramwel leads Quality Control operations with rigor and resolve. His expertise spans analytical method validation, raw material testing, and finished product evaluation.', email: 'qc@comethealthcare.com', image: photoSrc(DEFAULT_MEDIA, 'team.bramwelWambua') },
      { name: 'Mr. Peter Ngossi', role: 'Sales Manager', bio: "Peter leads the company's commercial strategy and drives growth across key markets. He is dedicated to building strong partnerships with hospitals, clinics, and distributors while positioning Comet as a trusted name in the industry.", email: 'sales@comethealthcare.com', image: photoSrc(DEFAULT_MEDIA, 'team.peterNgossi') },
      { name: 'Mr. Julius Mala', role: 'Production Manager', bio: "Julius is the driving force behind Comet Healthcare's production operations, where precision meets performance. He ensures every batch is produced to exacting standards—on time, on spec, and in full compliance.", email: 'production@comethealthcare.com', image: photoSrc(DEFAULT_MEDIA, 'team.juliusMala') },
      { name: 'Eng. Josphat Ombui', role: 'Facilities & Equipment Manager', bio: "Josphat oversees Comet Healthcare's facilities and equipment operations, ensuring that all infrastructure, utilities, and technical systems run safely, efficiently, and in line with pharmaceutical-grade standards.", email: 'engineering@comethealthcare.com', image: photoSrc(DEFAULT_MEDIA, 'team.josphatOmbui') },
      { name: 'Mr. Ben Nyarondia', role: 'Head of Warehouse', bio: 'Ben leads warehouse operations, ensuring materials, products, and supplies are stored, handled, and distributed with precision and compliance. He oversees inventory control and coordinates inbound and outbound logistics.', email: 'dispatch@comethealthcare.com', image: photoSrc(DEFAULT_MEDIA, 'team.benNyarondia') },
      { name: 'Christopher Musembi', role: 'Head of Projects', bio: 'An accomplished and passionate pharmaceutical Scientist, Christopher oversees project planning, coordination, and diligent execution of key operational and strategic initiatives. He is keen on tapping technology to fast-track project milestones.', email: 'projects@comethealthcare.com', image: photoSrc(DEFAULT_MEDIA, 'team.christopherMusembi') },
    ],
  },
  book: {
    seo: {
      title: 'Book a Consultation',
      description: 'Book a direct consultation with Comet Healthcare’s senior pharmaceutical specialists. Real availability, focused 30-minute sessions and clear written next steps.',
    },
    hero: {
      eyebrow: 'Book a Consultation',
      title: 'Find a time that works',
      lead: 'Real availability from the people who build, register and qualify medicines at Comet — choose a specialist, pick a slot and get a clear written follow-up.',
      image: photoSrc(DEFAULT_MEDIA, 'facility.exterior'),
      imageWebp: photoWebp(DEFAULT_MEDIA, 'facility.exterior'),
      imageKey: 'facility.exterior',
    },
    assurances: [
      { icon: 'shieldcheck', value: '20+', label: 'Years of GMP practice' },
      { icon: 'users', value: '8', label: 'Senior specialists' },
      { icon: 'clock', value: '30 min', label: 'Focused sessions' },
      { icon: 'file', value: 'Written', label: 'Follow-up notes' },
    ],
    types: [
      'CDMO consultation',
      'Regulatory consultation',
      'Quality / GMP consultation',
      'R&D consultation',
      'Training consultation',
      'Partnerships & distribution',
      'General consultation',
    ],
    process: [
      { step: '01', title: 'Choose the right specialist', desc: 'Match your question to the person who owns that discipline — from regulatory strategy to production and quality.' },
      { step: '02', title: 'Pick a live slot', desc: 'Availability comes directly from our scheduling system. No phone tag, no tentative holds, no back-and-forth emails.' },
      { step: '03', title: 'Confirm and prepare', desc: 'You receive an instant reference and confirmation. Share a short brief and we will come ready to work.' },
    ],
    trust: {
      eyebrow: 'Why Comet',
      title: 'Advice from the people who do the work',
      lead: 'You are not routed to a call centre. Our specialists sit inside a PPB-registered, GMP-driven manufacturing operation in Machakos — so the guidance you get is practical, current and accountable.',
      points: [
        { icon: 'building', title: 'Grounded in a real plant', desc: 'Our advice comes from active production, QA, QC and regulatory teams — not from a distant sales desk.' },
        { icon: 'shieldcheck', title: 'Quality is the baseline', desc: 'Every conversation starts from patient safety, documented systems and standards that stand up to inspection.' },
        { icon: 'globe', title: 'Built for East Africa', desc: 'We understand PPB and regional pathways, local supply realities and the pressure to keep medicines affordable.' },
      ],
      image: photoSrc(DEFAULT_MEDIA, 'facility.story'),
      imageWebp: photoWebp(DEFAULT_MEDIA, 'facility.story'),
      imageKey: 'facility.story',
    },
    topics: [
      { icon: 'flask', title: 'CDMO & manufacturing', desc: 'Formulation, scale-up, technology transfer and contract manufacturing at any scale.', slug: 'christopher-musembi', photoKey: 'facility.production' },
      { icon: 'file', title: 'Regulatory & registration', desc: 'PPB and East African dossier strategy, renewals, variations and inspection readiness.', slug: 'dr-peter-asingo', photoKey: 'facility.gmp' },
      { icon: 'shieldcheck', title: 'Quality & GMP', desc: 'Batch release, SOPs, supplier verification, audits and laboratory control.', slug: 'dr-george-wafula', photoKey: 'facility.qualityLab' },
      { icon: 'microscope', title: 'R&D & analytical work', desc: 'Pre-formulation, method validation and bioequivalence-driven development.', slug: 'bramwel-wambua', photoKey: 'facility.analytical' },
      { icon: 'package', title: 'Supply & partnerships', desc: 'Distribution, stockist programmes and affordable access initiatives.', slug: 'peter-ngossi', photoKey: 'facility.packaging' },
      { icon: 'users', title: 'Operations & facilities', desc: 'Production planning, equipment qualification and compliant infrastructure.', slug: 'julius-mala', photoKey: 'facility.operations' },
    ],
    expectations: [
      'A focused 30-minute conversation about your product, programme or compliance question.',
      'Straight answers grounded in real Kenyan manufacturing and regulatory practice.',
      'A short written summary with proposed next steps — no obligation to proceed.',
      'Direct introductions to the right quality, regulatory or production colleague when needed.',
    ],
    faqs: [
      { q: 'How long is a consultation?', a: 'Sessions are 30 minutes. Pick the topic that best fits your question and we will prepare around it. If the discussion needs more depth, we will recommend the right follow-up.' },
      { q: 'What should I prepare?', a: 'A short description of your product or challenge, the stage you are at, target markets and any deadlines. You can add this in the notes field when booking.' },
      { q: 'Is there a fee?', a: 'Introductory consultations are complimentary. Any subsequent project scope, testing or manufacturing work is quoted separately and agreed in writing before work begins.' },
      { q: 'Can I change or cancel?', a: 'Yes. Use your booking reference in the client portal to review upcoming consultations, or contact us if you need help rescheduling at short notice.' },
    ],
  },
  contact: {
    hero: { eyebrow: 'Get in Touch', title: 'Contact Comet Healthcare', lead: 'Product inquiries, CDMO partnerships, catalogue requests or support — our team is ready with reliable answers.' },
    locations: [
      { icon: 'map', place: 'Head office & plant', detail: 'Mua-Kitanga Road, off Mombasa Road, Machakos, Kenya' },
      { icon: 'mail', place: 'Commercial & regulatory', detail: 'P.O. BOX 6293, Nairobi, Kenya 00300' },
      { icon: 'clock', place: 'Service hours (all sites)', detail: 'Mon–Fri 8:00am–5:00pm · Sat 8:30am–3:00pm' },
    ],
  },
}

// Deep-merge `override` over `base`. Arrays and scalars are replaced; plain
// objects merge field-by-field. Never mutates inputs.
export function deepMerge(base, override) {
  if (override === undefined || override === null) return base
  if (Array.isArray(base) || Array.isArray(override)) return override
  if (typeof base !== 'object' || typeof override !== 'object') return override
  const out = { ...base }
  for (const key of Object.keys(override)) {
    out[key] = deepMerge(base[key], override[key])
  }
  return out
}

export function resolveContent(override) {
  // Keep stored image paths untouched. The client applies the shared media
  // registry at render time, so a later photo change can never leave a stale
  // rewritten path behind in the database.
  return deepMerge(DEFAULT_SITE_CONTENT, override)
}

export async function getSiteContent(prisma) {
  const setting = await prisma.setting.findUnique({ where: { key: 'site_content' } })
  return resolveContent(setting?.value)
}

// Persists an override (partial or full) merged with defaults so the stored
// record is always the complete, resolved tree.
export async function setSiteContent(prisma, override) {
  const merged = resolveContent(override)
  await prisma.setting.upsert({
    where: { key: 'site_content' },
    update: { value: merged },
    create: { key: 'site_content', value: merged },
  })
  return merged
}