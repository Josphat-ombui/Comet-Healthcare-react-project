import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Menu, X, Phone, Mail, ChevronDown, CalendarDays, UserCircle2,
  ShieldCheck, Sparkles, Compass, FlaskConical, Users,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useContent } from '../context/ContentContext.jsx'
import { contactHref, DEFAULT_GLOBAL } from '../lib/site.js'
import { primaryNav, isActivePath, isAboutActive } from '../lib/navigation.js'
import Button from './ui/Button.jsx'
import Logo from './Logo.jsx'

const aboutChildIcons = {
  '/mission': Compass,
  '/culture': Sparkles,
  '/science': FlaskConical,
  '/team': Users,
}

function initials(name) {
  return name
    ? `${name.split(' ').slice(0, 2).map((p) => p[0] || '').join('')}`.toUpperCase()
    : 'C'
}

const linkBase =
  'relative inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 hover:-translate-y-px text-ink/75 hover:text-primary hover:bg-primary-50 active:scale-[0.98]'
const linkActive =
  'relative inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 hover:-translate-y-px text-white bg-gradient-to-r from-primary to-primary-strong shadow-[0_12px_24px_-12px_rgba(0,123,255,0.85)]'

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' && window.scrollY > 24)
  const [openDropdown, setOpenDropdown] = useState(false)
  const { user } = useAuth()
  const { site } = useContent()
  const global = { ...DEFAULT_GLOBAL, ...(site?.global || {}) }
  const location = useLocation()

  const isHome = location.pathname === '/'
  const frosted = isHome && !scrolled && !isOpen

  const aboutActive = isAboutActive(location.pathname)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    setIsOpen(false)
    setOpenDropdown(false)
  }, [location.pathname])

  return (
    <>
      {/* ======================= Top utility bar ======================= */}
      <div className="relative hidden overflow-hidden border-b border-primary/10 bg-gradient-to-r from-primary-50 via-white to-primary-50 text-xs text-slate md:block">
        <div className="absolute -top-10 -right-8 h-32 w-64 rounded-full bg-primary-light/20 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-12 -left-8 h-32 w-64 rounded-full bg-primary-strong/10 blur-3xl" aria-hidden="true" />
        <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <a href={contactHref(global.phone)} className="flex items-center gap-1.5 font-medium transition-colors hover:text-primary">
              <Phone size={12} aria-hidden="true" /> {global.phone}
            </a>
            <a href={contactHref(global.email, 'mailto')} className="flex items-center gap-1.5 font-medium transition-colors hover:text-primary">
              <Mail size={12} aria-hidden="true" /> {global.email}
            </a>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-1.5 font-semibold text-primary xl:inline-flex">
              <ShieldCheck size={12} className="text-primary-strong" aria-hidden="true" /> GMP Certified
            </span>
            <span className="hidden items-center gap-1.5 font-semibold text-primary xl:inline-flex">
              <Sparkles size={12} className="text-primary-strong" aria-hidden="true" /> PPB Registered
            </span>
            <span className="h-3.5 w-px bg-primary/15" aria-hidden="true" />
            <span className="text-slate/70">{global.hours}</span>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent" aria-hidden="true" />
      </div>

      {/* ========================= Main nav ========================= */}
      <nav
        className={`sticky top-0 z-50 border-b transition-all duration-300 ${
          isHome ? '-mb-[4.5rem] lg:-mb-[5.25rem]' : ''
        } ${
          frosted
            ? 'border-white/70 bg-white/75 backdrop-blur-xl'
            : 'border-mist/80 bg-white/95 shadow-[0_18px_44px_-24px_rgba(0,82,204,0.3)] backdrop-blur-xl'
        }`}
        aria-label="Main navigation"
      >
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute inset-0 bg-gradient-to-r from-primary-50/50 via-white/70 to-primary-50/50" />
          <div className="absolute -top-16 left-1/4 h-40 w-96 bg-primary-50/80 blur-3xl" />
          <div className="absolute -bottom-20 right-1/5 h-44 w-80 bg-primary-light/10 blur-3xl" />
          <div className="absolute inset-x-1/4 top-0 h-[3px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-[4.5rem] items-center justify-between gap-6 lg:h-[5.25rem]">
            {/* Brand */}
            <Link to="/" className="group flex shrink-0 items-center gap-3" aria-label="Comet Healthcare home">
              <span className="block transition-transform duration-300 group-hover:-rotate-2 group-hover:scale-[1.04]">
                <Logo markClassName="h-11 w-11 lg:h-13 lg:w-13" />
              </span>
            </Link>

            {/* Primary links */}
            <div className="hidden items-center gap-0.5 xl:flex">
              {primaryNav.map((link) => {
                const active = isActivePath(location.pathname, link)

                if (link.children) {
                  return (
                    <div
                      key={link.name}
                      className="relative"
                      onMouseEnter={() => setOpenDropdown(true)}
                      onMouseLeave={() => setOpenDropdown(false)}
                    >
                      <Link
                        to={link.path}
                        aria-haspopup="true"
                        aria-expanded={openDropdown || aboutActive}
                        aria-current={aboutActive ? 'page' : undefined}
                        className="relative inline-flex items-center gap-1.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-px"
                        onClick={() => setOpenDropdown((v) => !v)}
                      >
                        <span className={`relative rounded-full px-4 py-2.5 transition-all duration-200 ${aboutActive ? 'bg-gradient-to-r from-primary to-primary-strong text-white shadow-[0_12px_24px_-12px_rgba(0,123,255,0.85)]' : 'text-ink/75 hover:bg-primary-50 hover:text-primary'}`}>
                          {link.name}
                        </span>
                        <ChevronDown
                          size={14}
                          className={`relative -ml-2.5 transition-transform duration-200 ${aboutActive ? 'text-white' : 'text-slate'} ${openDropdown || aboutActive ? 'rotate-180' : ''}`}
                          aria-hidden="true"
                        />
                      </Link>

                      {(openDropdown || aboutActive) && (
                        <div className="animate-fade-in-up absolute left-0 top-full mt-3 w-80 overflow-hidden rounded-2xl border border-mist bg-white/95 shadow-pop backdrop-blur-xl">
                          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-primary via-primary-strong to-primary-light" aria-hidden="true" />
                          <div className="p-2.5">
                            {link.children.map((child) => {
                              const ChildIcon = aboutChildIcons[child.path] || Compass
                              const childActive = location.pathname === child.path
                              return (
                                <Link
                                  key={child.path}
                                  to={child.path}
                                  onClick={() => setOpenDropdown(false)}
                                  aria-current={childActive ? 'page' : undefined}
                                  className={`group flex items-center gap-4 rounded-xl px-4 py-3.5 transition-all duration-200 ${
                                    childActive ? 'bg-primary-50' : 'hover:bg-primary-50/70'
                                  }`}
                                >
                                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-strong text-white shadow-[0_8px_18px_-8px_rgba(0,82,204,0.8)] transition-transform duration-200 group-hover:scale-110">
                                    <ChildIcon size={17} aria-hidden="true" />
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block text-sm font-semibold text-ink">{child.name}</span>
                                    <span className="mt-0.5 block truncate text-xs text-slate">{child.desc}</span>
                                  </span>
                                  <ChevronDown size={15} className="ml-auto -rotate-90 text-mist transition-colors group-hover:text-primary" aria-hidden="true" />
                                </Link>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }

                return (
                  <Link
                    key={link.name}
                    to={link.path}
                    className={active ? linkActive : linkBase}
                    aria-current={active ? 'page' : undefined}
                  >
                    {link.name}
                  </Link>
                )
              })}
            </div>

            {/* Right cluster */}
            <div className="hidden items-center gap-3 lg:flex">
              <Link
                to="/book"
                className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-primary to-primary-strong px-6 py-2.5 text-sm font-bold text-white shadow-[0_14px_28px_-12px_rgba(0,82,204,0.7)] transition-all duration-300 hover:-translate-y-px hover:shadow-[0_18px_34px_-12px_rgba(0,123,255,0.8)]"
              >
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" aria-hidden="true" />
                <CalendarDays size={15} aria-hidden="true" /> Book a Consultation
              </Link>

              <span className="h-7 w-px bg-primary/15" aria-hidden="true" />

              {user ? (
                <Link
                  to={user.role === 'ADMIN' ? '/portal/admin' : '/portal'}
                  className="flex items-center gap-2.5 rounded-full border border-mist bg-white/80 py-1.5 pl-1.5 pr-3.5 backdrop-blur transition-all duration-200 hover:border-primary hover:shadow-card"
                  aria-label="Open your portal"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-strong text-xs font-bold text-white shadow-[0_8px_16px_-8px_rgba(0,82,204,0.8)]">
                    {initials(user.firstName)}
                  </span>
                  <span className="max-w-24 truncate text-sm font-semibold text-ink">{user.firstName}</span>
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold text-ink/75 transition-colors hover:bg-primary-50 hover:text-primary"
                >
                  <UserCircle2 size={17} aria-hidden="true" /> Sign in
                </Link>
              )}
            </div>

            {/* Mobile toggle */}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="rounded-full border border-mist/80 bg-white/80 p-2.5 text-ink transition-colors hover:bg-primary-50 xl:hidden"
              aria-expanded={isOpen}
              aria-label={isOpen ? 'Close menu' : 'Open menu'}
            >
              {isOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile panel */}
        {isOpen && (
          <div className="animate-fade-in-up relative border-t border-mist bg-white/98 shadow-pop backdrop-blur-xl xl:hidden">
            <div className="mx-auto max-w-7xl space-y-1 px-4 py-4 sm:px-6">
              {primaryNav.map((link) => {
                const active = isActivePath(location.pathname, link)
                return (
                  <div key={link.name}>
                    <Link
                      to={link.path}
                      onClick={() => setIsOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={`block rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                        active ? 'bg-primary-50 text-primary' : 'text-ink hover:bg-cream'
                      }`}
                    >
                      {link.name}
                    </Link>
                    {link.children && (
                      <div className="ml-4 space-y-0.5">
                        {link.children.map((child) => {
                          const childActive = location.pathname === child.path
                          return (
                            <Link
                              key={child.path}
                              to={child.path}
                              onClick={() => setIsOpen(false)}
                              aria-current={childActive ? 'page' : undefined}
                              className={`block rounded-lg px-4 py-2.5 text-sm transition-colors ${
                                childActive ? 'bg-primary-50 text-primary' : 'text-ink/70 hover:bg-primary-50 hover:text-primary'
                              }`}
                            >
                              {child.name}
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
              <div className="space-y-2 pt-3">
                <Button to="/book" block size="md">
                  <CalendarDays size={16} aria-hidden="true" /> Book a Consultation
                </Button>
                <Button to={user ? (user.role === 'ADMIN' ? '/portal/admin' : '/portal') : '/login'} variant="outline" block size="md">
                  <UserCircle2 size={16} aria-hidden="true" /> {user ? 'My Portal' : 'Sign in'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </nav>
    </>
  )
}
