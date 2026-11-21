import { Mail } from 'lucide-react'
import SectionReveal from '../components/SectionReveal'
import CTASection from '../components/CTASection'
import { useContent, useMedia } from '../context/ContentContext.jsx'
import { personPhotoKey } from '../lib/experts.js'
import { photoSrc } from '../lib/media.js'

const teamMembers = [
  {
    name: 'Dr. Peter Ochieng\' Asingo',
    role: 'CEO & Founder',
    bio: 'A career pharmacist endowed with immense experience and practice having served in government at different capacities, and in pharmaceutical supply chain. His leadership advocates strict compliance to cGMP standards with a focus on Safety, Efficacy, and Quality.',
    email: 'info@comethealthcares.com',
    photo: 'team.peterAsingo',
  },
  {
    name: 'Dr. George Wafula',
    role: 'Quality Assurance Manager',
    bio: 'With over 15 years of experience in pharmaceutical quality systems, Dr. George Wafula is the precision powerhouse behind Comet Healthcare\'s uncompromising standards. His expertise spans GMP, ISO protocols, and global regulatory frameworks.',
    email: 'qualityassurance@comethealthcare.com',
    photo: 'team.georgeWafula',
  },
  {
    name: 'Mr. Bramwel Wambua',
    role: 'Quality Control Manager',
    bio: 'With a sharp analytical mind and deep commitment to pharmaceutical standards, Bramwel leads Quality Control operations with rigor and resolve. His expertise spans analytical method validation, raw material testing, and finished product evaluation.',
    email: 'qc@comethealthcare.com',
    photo: 'team.bramwelWambua',
  },
  {
    name: 'Mr. Peter Ngossi',
    role: 'Sales Manager',
    bio: 'Peter leads the company\'s commercial strategy and drives growth across key markets. He is dedicated to building strong partnerships with hospitals, clinics, and distributors while positioning Comet as a trusted name in the industry.',
    email: 'sales@comethealthcare.com',
    photo: 'team.peterNgossi',
  },
  {
    name: 'Mr. Julius Mala',
    role: 'Production Manager',
    bio: 'Julius is the driving force behind Comet Healthcare\'s production operations, where precision meets performance. He ensures every batch is produced to exacting standards—on time, on spec, and in full compliance.',
    email: 'production@comethealthcare.com',
    photo: 'team.juliusMala',
  },
  {
    name: 'Eng. Josphat Ombui',
    role: 'Facilities & Equipment Manager',
    bio: 'Josphat oversees Comet Healthcare\'s facilities and equipment operations, ensuring that all infrastructure, utilities, and technical systems run safely, efficiently, and in line with pharmaceutical-grade standards.',
    email: 'engineering@comethealthcare.com',
    photo: 'team.josphatOmbui',
  },
  {
    name: 'Mr. Ben Nyarondia',
    role: 'Head of Warehouse',
    bio: 'Ben leads warehouse operations, ensuring materials, products, and supplies are stored, handled, and distributed with precision and compliance. He oversees inventory control and coordinates inbound and outbound logistics.',
    email: 'dispatch@comethealthcare.com',
    photo: 'team.benNyarondia',
  },
  {
    name: 'Christopher Musembi',
    role: 'Head of Projects',
    bio: 'An accomplished and passionate pharmaceutical Scientist, Christopher oversees project planning, coordination, and diligent execution of key operational and strategic initiatives. He is keen on tapping technology to fast-track project milestones.',
    email: 'projects@comethealthcare.com',
    photo: 'team.christopherMusembi',
  },
]

const FALLBACK_HERO = {
  eyebrow: 'Our People',
  title: 'Our Team',
  lead: 'Since our founding in 2006, Comet Healthcare has remained committed to transforming every challenge into meaningful progress. Our professional team embodies hope, integrity, and innovation.',
}

export default function Team() {
  const { site } = useContent()
  const media = useMedia()
  const cmsTeam = site?.team || {}
  const hero = { ...FALLBACK_HERO, ...(cmsTeam.hero || {}) }
  const members = cmsTeam.members?.length ? cmsTeam.members : teamMembers.map((m) => ({
    name: m.name, role: m.role, bio: m.bio, email: m.email, photo: m.photo,
  }))

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
              <span className="text-secondary font-semibold text-sm uppercase tracking-wider">Our Professional Team</span>
              <h2 className="text-3xl md:text-4xl font-bold text-dark mt-3 font-heading">Meet the Minds Behind Our Success</h2>
              <p className="text-gray-600 mt-4 max-w-2xl mx-auto">
                We foster an open-minded work environment that celebrates diversity, encourages collaboration, and empowers bold thinking across every department.
              </p>
            </div>
          </SectionReveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {members.map((member, i) => {
              const photoKey = personPhotoKey(member.name) || member.photo
              const portrait = photoKey ? photoSrc(media, photoKey) : member.image
              return (
              <SectionReveal key={`${member.name}-${i}`} delay={i * 50}>
                <div className="group bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 overflow-hidden">
                  <div className="h-48 bg-gradient-to-br from-primary/15 to-secondary/15 overflow-hidden">
                    <img src={portrait} alt={member.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" loading="lazy" />
                  </div>
                  <div className="p-6 text-center">
                    <h3 className="text-lg font-bold text-dark font-heading leading-tight">{member.name}</h3>
                    <p className="text-primary text-sm font-medium mt-1">{member.role}</p>
                    <p className="text-gray-500 text-xs mt-3 leading-relaxed">{member.bio}</p>
                    <a
                      href={`mailto:${member.email}`}
                      className="inline-flex items-center gap-1.5 text-primary hover:text-primary-light text-xs font-medium mt-4 transition-colors"
                    >
                      <Mail size={12} /> {member.email}
                    </a>
                  </div>
                </div>
              </SectionReveal>
              )
            })}
          </div>
        </div>
      </section>

      <CTASection />
    </>
  )
}
