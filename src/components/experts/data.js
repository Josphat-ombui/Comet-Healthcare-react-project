// Editorial content for the expanded expert page.
// The narrative is taken from Comet Healthcare's About Us page. All photography
// resolves through the shared media registry so one edit updates every page.

import { DEFAULT_MEDIA, photoSrc, photoWebp } from '../../lib/media.js'

const PHOTO_KEYS = {
  story: 'facility.story',
  purpose: 'facility.tablets',
  focus: 'facility.packaging',
  quality: 'facility.qualityLab',
  research: 'facility.research',
  analytical: 'facility.analytical',
  mission: 'facility.operations',
  community: 'site.community',
  services: 'facility.production',
  facility: 'facility.hero',
  cta: 'site.story',
}

export function getImages(media = DEFAULT_MEDIA) {
  return Object.fromEntries(
    Object.entries(PHOTO_KEYS).map(([key, path]) => [key, photoSrc(media, path)])
  )
}

// Lightweight WebP alternatives from the shared registry (~75 KB derivatives).
export function getWebp(media = DEFAULT_MEDIA) {
  return Object.fromEntries(
    Object.entries(PHOTO_KEYS)
      .map(([key, path]) => [key, photoWebp(media, path)])
      .filter(([, value]) => value)
  )
}

export const IMAGES = getImages()
export const WEBP = getWebp()

export const STORY = {
  eyebrow: 'About Comet',
  title: 'A leading pharmaceutical manufacturer in Kenya & East Africa',
  paragraphs: [
    'Comet Healthcare Ltd has built a distinguished reputation and gained extensive experience over the last 20 years. During this time, the company has evolved from strength to strength, earning recognition as one of Kenya’s premier pharmaceutical companies. We remain dedicated to developing and manufacturing medicines of the highest quality, with a steadfast focus on improving lives by providing better treatment options.',
    'In recent years, Comet Healthcare Ltd has undergone transformative changes, embracing current international GMP standards with full adoption of cGMP-compliant structural modifications. Our facilities now feature modernized equipment and a state-of-the-art pharmaceutical manufacturing plant that reflects our commitment to excellence.',
    'We value our customers deeply and are committed to consistently delivering innovative, quality, affordable, and accessible healthcare solutions. At Comet Healthcare Ltd, our core values—integrity, excellence, quality assurance, and innovation—guide everything we do as we work toward a healthier future for all.',
  ],
  stats: [
    { value: '20', suffix: '+', label: 'Years of experience' },
    { value: 'cGMP', suffix: '', label: 'Aligned facilities' },
    { value: 'PPB', suffix: '', label: 'Registered operations' },
    { value: 'EA', suffix: '', label: 'Regional reach' },
  ],
}

export const PURPOSE = {
  eyebrow: 'Our Purpose',
  title: 'Access to essential medicine should be a right, not a privilege',
  body: 'Our purpose is to bridge the gaps that limit access to essential medicines and healthcare support in Kenya. We work to simplify regulatory processes, improve product availability, and support better patient outcomes. Every initiative we undertake is designed to make healthcare more accessible and affordable. We believe that dependable healthcare should be a right, not a privilege.',
  focusTitle: 'What we focus on',
  focusBody: 'Our core focus areas include regulatory support, quality assurance, supply chain management, and digital health solutions. We design services that help healthcare providers access the right products at the right time. By combining operational efficiency with strong quality systems, we support better outcomes for patients and facilities. Our goal is to strengthen every link in the healthcare delivery chain.',
  focusAreas: [
    'Regulatory support',
    'Quality assurance',
    'Supply chain management',
    'Digital health solutions',
  ],
}

export const HOW_WE_WORK = {
  eyebrow: 'How we work',
  title: 'Excellence is a discipline, practised every day',
  lead: 'At Comet Healthcare Ltd, our approach to pharmaceutical manufacturing is built on a foundation of excellence, innovation, and unwavering commitment to quality.',
  items: [
    {
      icon: 'shieldcheck',
      title: 'GMP by design',
      body: 'We maintain strict adherence to current Good Manufacturing Practices (cGMP) and international GMP standards throughout every stage of production. Our state-of-the-art facilities and modernized equipment ensure that every medicine we produce meets the highest quality benchmarks.',
    },
    {
      icon: 'flask',
      title: 'Innovation with purpose',
      body: 'Our dedicated team continuously works to develop innovative pharmaceutical solutions that address the evolving healthcare needs of our communities. We invest in research to improve existing formulations and create new treatment options that are both effective and accessible.',
    },
    {
      icon: 'microscope',
      title: 'Quality in our DNA',
      body: 'Quality assurance is embedded in our DNA. From raw material sourcing to final product distribution, we implement comprehensive testing and validation protocols to ensure safety, efficacy, and consistency in every batch we manufacture.',
    },
    {
      icon: 'heart',
      title: 'Customers at the centre',
      body: 'We place our customers at the heart of everything we do. By listening to healthcare providers and patients alike, we ensure our products remain relevant, accessible, and affordable while maintaining uncompromising quality standards.',
    },
    {
      icon: 'trend',
      title: 'Always evolving',
      body: 'With 20 years of experience, we understand that excellence requires constant evolution. We regularly update our processes, invest in cutting-edge technology, and train our team to stay ahead of industry developments and regulatory requirements.',
    },
    {
      icon: 'award',
      title: 'Integrity first',
      body: 'Integrity guides our business practices. We operate transparently, maintain ethical relationships with all stakeholders, and ensure that our commitment to improving lives never wavers.',
    },
  ],
}

export const MISSION_VISION = {
  eyebrow: 'Our Mission & Vision',
  title: 'Reliable medicines. Stronger healthcare systems.',
  mission: {
    label: 'Our Mission',
    paragraphs: [
      'We strive to deliver high-quality, safe, and affordable medicines that meet global standards for the well-being of patients.',
      'We work to expand access to essential healthcare through innovation, ethical practice, and strong partnerships.',
      'We are committed to supporting healthcare providers and communities with reliable pharmaceutical solutions that improve lives worldwide.',
    ],
  },
  vision: {
    label: 'Our Vision',
    paragraphs: [
      'A healthier future for all.',
      'Reliable pharmaceutical solutions that improve lives worldwide.',
    ],
  },
  values: ['Integrity', 'Excellence', 'Quality assurance', 'Innovation'],
}

export const SERVICES = {
  eyebrow: 'Our Services',
  title: 'Practical support across the whole product journey',
  lead: 'In Kenya’s rapidly evolving healthcare landscape, pharmaceutical startups must balance regulatory compliance, product quality, and market penetration while operating with lean resources. Comet Healthcare is built on the commitment to deliver safe, accessible, and reliable medical solutions to communities across the country. Our services are designed to meet the practical needs of healthcare providers, patients, and distributors — ensuring trust, efficiency, and long-term impact.',
  items: [
    {
      icon: 'shieldcheck',
      title: 'Quality Assurance & GMP Compliance',
      intro: 'Ensuring every product meets Kenyan and international quality standards through:',
      bullets: [
        'Batch testing and documentation',
        'SOP development',
        'Supplier and raw-material verification',
        'Internal audits and continuous quality improvement',
      ],
    },
    {
      icon: 'file',
      title: 'Regulatory Affairs & Product Registration',
      intro: 'Supporting full compliance with the Pharmacy and Poisons Board (PPB) through:',
      bullets: [
        'Dossier preparation and submission',
        'Product registration and renewals',
        'Post-approval variations',
        'Regulatory guidance for imports and local manufacturing',
        'Stability testing',
      ],
    },
    {
      icon: 'package',
      title: 'Distribution & Supply Chain Management',
      intro: 'Building a reliable and efficient supply network with:',
      bullets: [
        'Partnerships with reputable distributors',
        'Inventory forecasting and stock-level monitoring',
        'Timely delivery to pharmacies, clinics, and hospitals',
        'Pharmacovigilance, post-distribution QMS events, product recalls, market complaints and product returns',
      ],
    },
    {
      icon: 'users',
      title: 'Medical Representative & Field Marketing',
      intro: 'Driving product awareness and adoption through:',
      bullets: [
        'Hospital and pharmacy detailing',
        'Clinician engagement and product demonstrations',
        'Territory mapping and sales reporting',
        'Sampling and promotional activities',
      ],
    },
    {
      icon: 'heart',
      title: 'Patient Support & Community Health Programs',
      intro: 'Strengthening patient outcomes and brand loyalty through:',
      bullets: [
        'Disease-awareness campaigns (diabetes, hypertension, maternal health)',
        'SMS-based adherence reminders',
        'Affordable access initiatives',
        'Collaboration with county health facilities and NGOs',
      ],
    },
    {
      icon: 'clipboard',
      title: 'Digital Health & E-Pharmacy Integration',
      intro: 'Leveraging Kenya’s mobile-first culture with:',
      bullets: [
        'WhatsApp-based prescription support',
        'Digital product catalogues',
      ],
    },
  ],
}

export const LEADERSHIP = {
  eyebrow: 'Our Team',
  title: 'The specialists behind our standards',
  lead: 'Our team is made up of dedicated professionals who bring deep expertise in pharmaceutical operations, quality assurance, regulatory compliance, and project execution. Each member plays a vital role in ensuring that Comet Healthcare delivers safe, high-quality, and affordable medicines to the communities we serve. United by a shared commitment to excellence, integrity, and innovation, our team works collaboratively to strengthen healthcare systems and support better patient outcomes across the region.',
  members: [
    {
      name: 'Dr. George Wafula',
      role: 'Quality Assurance Manager',
      image: photoSrc(DEFAULT_MEDIA, 'team.georgeWafula'),
      cutout: true,
      bio: 'Dr. George Wafula is a dedicated Quality Assurance Manager at Comet Healthcare, bringing strong expertise in pharmaceutical quality systems, regulatory compliance, and product safety. He oversees the implementation of Good Manufacturing Practices (GMP), ensures adherence to global and local quality standards, and leads continuous improvement initiatives across all operations.',
      bioMore: 'With a strong background in clinical and pharmaceutical quality management, he plays a key role in safeguarding product integrity from sourcing to distribution. His commitment to excellence, ethical practice, and patient safety drives Comet Healthcare’ mission to deliver high-quality and affordable medicines to communities in Kenya and beyond.',
      email: 'info@comethealthcares.com',
      phone: '+254 725 519 844',
    },
    {
      name: 'Mr. Peter Ngossi',
      role: 'Sales Manager',
      image: photoSrc(DEFAULT_MEDIA, 'team.peterNgossi'),
      bio: 'Peter Ngossi is an experienced Sales Manager at Comet Healthcare, leading the company’s commercial strategy and market expansion efforts. He specializes in building strong relationships with hospitals, pharmacies, and distributors while driving sustainable sales growth across Kenya.',
      bioMore: 'With a deep understanding of pharmaceutical market dynamics, he ensures that Comet’s products reach the right customers with efficiency and reliability. Peter is known for his strategic approach, team leadership, and commitment to delivering value to healthcare providers and patients.',
      email: 'info@comethealthcares.com',
    },
    {
      name: 'Mr. Bramwel Wambua',
      role: 'Quality Control Manager',
      image: photoSrc(DEFAULT_MEDIA, 'team.bramwelWambua'),
      bio: 'Bramwel Wambua serves as the Quality Control Manager at Comet Healthcare, where he oversees all laboratory testing and product verification processes. He ensures that every batch meets strict safety, purity, and efficacy standards before reaching healthcare providers and patients.',
      bioMore: 'With strong expertise in analytical methods, regulatory requirements, and pharmaceutical quality systems, Bramwell plays a vital role in maintaining the integrity of Comet’s product portfolio. Through his leadership, the quality control team upholds the highest standards of excellence across all operations.',
      email: 'qc@comethealthcares.com',
    },
  ],
}

export const EXPERT_CTA = {
  eyebrow: 'Want to find out more?',
  title: 'Let’s talk about your next pharmaceutical programme',
  body: 'Get in touch with our team of experts to explore bespoke end-to-end CDMO support of your complete drug lifecycle — at any scale.',
}
