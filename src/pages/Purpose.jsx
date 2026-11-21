import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, ChevronRight } from 'lucide-react'
import PageHero from '../components/PageHero.jsx'
import Button from '../components/ui/Button.jsx'
import { useContent, useMedia } from '../context/ContentContext.jsx'
import usePageMeta from '../lib/usePageMeta.js'
import { resolvePurposeContent } from '../components/purpose/content.js'
import { mediaImage } from '../lib/media.js'
import { getImages, SECTIONS } from '../components/purpose/data.js'
import SectionNav from '../components/ui/SectionNav.jsx'
import BeliefSection from '../components/purpose/BeliefSection.jsx'
import PrinciplesSection from '../components/purpose/PrinciplesSection.jsx'
import WellbeingSection from '../components/purpose/WellbeingSection.jsx'
import ServiceSection from '../components/purpose/ServiceSection.jsx'
import PeopleSection from '../components/purpose/PeopleSection.jsx'
import PurposeCTA from '../components/purpose/PurposeCTA.jsx'

export default function Purpose() {
  const { site } = useContent()
  const media = useMedia()
  const images = useMemo(() => getImages(media), [media])
  const content = useMemo(() => resolvePurposeContent(site), [site])

  usePageMeta(content.seo)

  const breadcrumb = (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate">
      <Link to="/" className="transition-colors hover:text-primary">Home</Link>
      <ChevronRight size={13} aria-hidden="true" className="text-primary/50" />
      <span aria-current="page" className="text-primary">{content.hero.title}</span>
    </nav>
  )

  return (
    <>
      <PageHero
        eyebrow={content.hero.eyebrow}
        title={content.hero.title}
        lead={content.hero.lead}
        image={images.hero}
        imageAlt="Comet Healthcare pharmaceutical manufacturing facility in Machakos, Kenya"
        breadcrumb={breadcrumb}
      >
        <Button to="/book" size="lg">
          <CalendarDays size={17} aria-hidden="true" /> Book a consultation
        </Button>
        <Button to="/experts" variant="outline" size="lg">
          Meet our experts <ArrowRight size={17} aria-hidden="true" />
        </Button>
      </PageHero>

      <SectionNav sections={SECTIONS} />
      <BeliefSection content={content.belief} />
      <PrinciplesSection items={content.principles} />
      <WellbeingSection content={content.wellbeing} />
      <ServiceSection content={content.service} />
      <PeopleSection content={content.people} />
      <PurposeCTA content={{ ...content.cta, image: mediaImage(media, 'site.story', content.cta?.image).src }} />
    </>
  )
}
