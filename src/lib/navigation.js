// Shared route/navigation map used by the header, footer and cross-page links.
// Keeping this in one place prevents the primary menu and footer drifting apart.
export const ROUTES = {
  home: '/',
  purpose: '/our-purpose',
  purposeAlias: '/purpose',
  experts: '/experts',
  services: '/services',
  products: '/products',
  about: '/about',
  mission: '/mission',
  culture: '/culture',
  science: '/science',
  team: '/team',
  contact: '/contact',
  book: '/book',
  testimonials: '/testimonials',
  portal: '/portal',
  login: '/login',
}

const aboutChildren = [
  { name: 'Our Mission', path: ROUTES.mission, desc: 'What we work toward' },
  { name: 'Our Culture', path: ROUTES.culture, desc: 'How we work together' },
  { name: 'Our Science', path: ROUTES.science, desc: 'Quality & GMP rigor' },
  { name: 'Our Team', path: ROUTES.team, desc: 'The people behind the plant' },
]

export const primaryNav = [
  { name: 'Home', path: ROUTES.home },
  {
    name: 'Purpose',
    path: ROUTES.purpose,
    // Older links and bookmarks still resolve to the original route.
    aliases: [ROUTES.purposeAlias],
  },
  { name: 'Experts', path: ROUTES.experts },
  { name: 'Services', path: ROUTES.services },
  { name: 'Products', path: ROUTES.products },
  { name: 'About', path: ROUTES.about, children: aboutChildren },
  { name: 'Contact', path: ROUTES.contact },
]

export const footerCompanyLinks = [
  { name: 'About Us', path: ROUTES.about },
  { name: 'Our Purpose', path: ROUTES.purpose },
  { name: 'Our Mission', path: ROUTES.mission },
  { name: 'Our Culture', path: ROUTES.culture },
  { name: 'Our Science', path: ROUTES.science },
  { name: 'Our Team', path: ROUTES.team },
  { name: 'Contact', path: ROUTES.contact },
]

export const footerExploreLinks = [
  { name: 'Our Experts', path: ROUTES.experts },
  { name: 'What We Offer', path: ROUTES.services },
  { name: 'Pharma Products', path: ROUTES.products },
  { name: 'Client Testimonials', path: ROUTES.testimonials },
  { name: 'Book a Consultation', path: ROUTES.book },
  { name: 'Client Portal', path: ROUTES.portal },
]

export const purposeRelatedLinks = [
  { name: 'Our Mission', path: ROUTES.mission },
  { name: 'Our Culture', path: ROUTES.culture },
  { name: 'Our Science', path: ROUTES.science },
  { name: 'Our Team', path: ROUTES.team },
  { name: 'Our Services', path: ROUTES.services },
  { name: 'Meet the Experts', path: ROUTES.experts },
]

export const missionRelatedLinks = [
  { name: 'Our Purpose', path: ROUTES.purpose },
  { name: 'Our Culture', path: ROUTES.culture },
  { name: 'Our Science', path: ROUTES.science },
  { name: 'Our Team', path: ROUTES.team },
  { name: 'Our Services', path: ROUTES.services },
]

export const cultureRelatedLinks = [
  { name: 'Our Mission', path: ROUTES.mission },
  { name: 'Our Purpose', path: ROUTES.purpose },
  { name: 'Our Team', path: ROUTES.team },
  { name: 'Our Services', path: ROUTES.services },
]

export function isActivePath(pathname, link) {
  return pathname === link.path || Boolean(link.aliases?.includes(pathname))
}

export function isAboutActive(pathname) {
  const about = primaryNav.find((link) => link.name === 'About')
  if (!about) return false
  return isActivePath(pathname, about) || Boolean(about.children?.some((child) => isActivePath(pathname, child)))
}
