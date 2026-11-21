import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, ChevronRight } from 'lucide-react'
import PageHero from '../components/PageHero.jsx'
import Button from '../components/ui/Button.jsx'
import SectionNav from '../components/ui/SectionNav.jsx'
import { useContent, useMedia } from '../context/ContentContext.jsx'
import usePageMeta from '../lib/usePageMeta.js'
import { resolveMissionContent } from '../components/mission/content.js'
import { getImages, SECTIONS } from '../components/mission/data.js'
import MissionStatement from '../components/mission/MissionStatement.jsx'
import VisionStatement from '../components/mission/VisionStatement.jsx'
import ValuesSection from '../components/mission/ValuesSection.jsx'
import FocusTabs from '../components/mission/FocusTabs.jsx'
import MissionCTA from '../components/mission/MissionCTA.jsx'

export default function Mission() {
  const { site } = useContent()
  const media = useMedia()
  const images = useMemo(() => getImages(media), [media])
  const content = useMemo(() => resolveMissionContent(site), [site])

  usePageMeta(content.seo)

  const breadcrumb = (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate">
      <Link to="/" className="transition-colors hover:text-primary">Home</Link>
      <ChevronRight size={13} aria-hidden="true" className="text-primary/50" />
      <Link to="/about" className="transition-colors hover:text-primary">About Us</Link>
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
        imageAlt="GMP-compliant production environment at Comet Healthcare"
        breadcrumb={breadcrumb}
      >
        <Button to="/book" size="lg">
          <CalendarDays size={17} aria-hidden="true" /> Book a consultation
        </Button>
        <Button to="/purpose" variant="outline" size="lg">
          Explore our purpose <ArrowRight size={17} aria-hidden="true" />
        </Button>
      </PageHero>

      <SectionNav sections={SECTIONS} />
      <MissionStatement content={content.mission} />
      <VisionStatement content={content.vision} />
      <ValuesSection content={content.values} />
      <FocusTabs content={content.focus} items={content.focusItems} />
      <MissionCTA content={{ ...content.cta, image: images.production }} />
    </>
  )
}
