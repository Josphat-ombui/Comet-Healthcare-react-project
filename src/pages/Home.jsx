import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useContent } from '../context/ContentContext.jsx'
import Hero from '../components/home/Hero.jsx'
import TrustBar from '../components/home/TrustBar.jsx'
import Solutions from '../components/home/Solutions.jsx'
import Impact from '../components/home/Impact.jsx'
import Innovations from '../components/home/Innovations.jsx'
import Experts from '../components/home/Experts.jsx'
import WhyChooseUs from '../components/home/WhyChooseUs.jsx'
import Insights from '../components/home/Insights.jsx'
import FinalCTA from '../components/home/FinalCTA.jsx'
import { IMPACT_STATS } from '../components/home/data.js'

// Normalise CMS stats (e.g. "20+") into numeric values for the animated counters.
function normaliseStats(stats) {
  return IMPACT_STATS.map((base, i) => {
    const fromCms = stats?.[i]
    if (!fromCms) return base
    const raw = String(fromCms.value ?? '')
    const number = Number(raw.replace(/[^\d.]/g, ''))
    const suffix = raw.replace(/[\d.,]/g, '') || base.suffix
    return {
      ...base,
      value: Number.isFinite(number) ? number : base.value,
      suffix,
      label: fromCms.label || base.label,
    }
  })
}

export default function Home() {
  const { site } = useContent()
  const [experts, setExperts] = useState([])
  const [testimonials, setTestimonials] = useState([])

  useEffect(() => {
    let active = true
    Promise.all([api.get('/providers?pageSize=3'), api.get('/content/testimonials')])
      .then(([expertsRes, tRes]) => {
        if (!active) return
        setExperts(expertsRes.items || [])
        setTestimonials(tRes.items || [])
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const home = site?.home || {}
  const valueProps = home.valueProps?.items || []

  return (
    <>
      <Hero content={home.hero || {}} />
      <TrustBar />
      <Solutions items={valueProps} heading={home.valueProps || {}} />
      <Impact stats={normaliseStats(home.hero?.stats)} testimonials={testimonials} />
      <Innovations />
      <Experts experts={experts} />
      <WhyChooseUs />
      <Insights />
      <FinalCTA />
    </>
  )
}
