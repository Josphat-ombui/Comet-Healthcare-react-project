// Shared icon registry — pages store icon names as strings in the CMS (so the
// JSON stays serialisable), then resolve them here on render.

import {
  Shield, ShieldCheck, FlaskConical, FileCheck2, GraduationCap, TrendingUp,
  Package, Microscope, BellRing, CalendarDays, ClipboardCheck, CheckCircle2,
  Award, Lightbulb, Heart, Users, Building2, Globe, Target, Beaker, Tablet,
  Atom, TestTube, Pill, Star, Quote, MapPin, Clock,
} from 'lucide-react'

export const ICONS = {
  shield: Shield,
  shieldcheck: ShieldCheck,
  flask: FlaskConical,
  file: FileCheck2,
  grad: GraduationCap,
  trend: TrendingUp,
  package: Package,
  microscope: Microscope,
  bell: BellRing,
  calendar: CalendarDays,
  clipboard: ClipboardCheck,
  check: CheckCircle2,
  award: Award,
  bulb: Lightbulb,
  heart: Heart,
  users: Users,
  building: Building2,
  globe: Globe,
  target: Target,
  beaker: Beaker,
  tablet: Tablet,
  atom: Atom,
  testtube: TestTube,
  pill: Pill,
  star: Star,
  quote: Quote,
  map: MapPin,
  clock: Clock,
  mail: FileCheck2,
}

export const Icon = ({ name, ...props }) => {
  const Cmp = ICONS[name] || Pill
  return <Cmp {...props} />
}

/** Thin helper: `useContentSection(site, 'home', fallback)` merges CMS section + fallback. */
export function pick(site, path, fallback) {
  const parts = path.split('.')
  let node = site
  for (const p of parts) {
    if (node && typeof node === 'object') node = node[p]
    else return fallback
  }
  return node ?? fallback
}