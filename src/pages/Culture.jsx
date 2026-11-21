import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronRight, Users } from 'lucide-react'
import PageHero from '../components/PageHero.jsx'
import Button from '../components/ui/Button.jsx'
import SectionNav from '../components/ui/SectionNav.jsx'
import { useContent, useMedia } from '../context/ContentContext.jsx'
import usePageMeta from '../lib/usePageMeta.js'
import { resolveCultureContent } from '../components/culture/content.js'
import { getImages, SECTIONS } from '../components/culture/data.js'
import PeopleVision from '../components/culture/PeopleVision.jsx'
import CultureMatters from '../components/culture/CultureMatters.jsx'
import CultureFocusTabs from '../components/culture/CultureFocusTabs.jsx'
import CultureValues from '../components/culture/CultureValues.jsx'
import PeopleSpotlight from '../components/culture/PeopleSpotlight.jsx'
import CultureCTA from '../components/culture/CultureCTA.jsx'

export default function Culture() {
  const { site } = useContent()
  const media = useMedia()
  const images = useMemo(() => getImages(media), [media])
  const content = useMemo(() => resolveCultureContent(site), [site])

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
        imageAlt="Comet Healthcare manufacturing team at work"
        breadcrumb={breadcrumb}
      >
        <Button to="/team" size="lg">
          <Users size={17} aria-hidden="true" /> Meet our team
        </Button>
        <Button to="/mission" variant="outline" size="lg">
          Explore our mission <ArrowRight size={17} aria-hidden="true" />
        </Button>
      </PageHero>

      <SectionNav sections={SECTIONS} />
      <PeopleVision content={content.peopleVision} />
      <CultureMatters content={content.culture} />
      <CultureFocusTabs content={content.focus} items={content.focusItems} />
      <CultureValues content={content.values} />
      <PeopleSpotlight content={content.people} />
      <CultureCTA content={{ ...content.cta, image: images.cta }} />
    </>
  )
}
