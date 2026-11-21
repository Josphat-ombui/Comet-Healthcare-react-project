import { Link } from 'react-router-dom'
import { Phone, Mail, MapPin, ArrowUpRight, ArrowRight } from 'lucide-react'
import { footerCompanyLinks, footerExploreLinks, ROUTES } from '../lib/navigation.js'
import { FacebookIcon, XIcon, LinkedInIcon } from './SocialIcons'
import Logo from './Logo.jsx'

const socials = [
  { label: 'Facebook', node: <FacebookIcon size={16} />, href: 'https://www.facebook.com/comethealthcare' },
  { label: 'X (Twitter)', node: <XIcon size={16} />, href: 'https://www.x.com/comethealthcare' },
  { label: 'LinkedIn', node: <LinkedInIcon size={16} />, href: 'https://www.linkedin.com/comethealthcare' },
]

export default function Footer() {
  return (
    <footer className="relative isolate overflow-hidden bg-gradient-to-br from-white via-primary-50 to-primary-100 text-ink">
      {/* Light ambient field */}
      <div className="absolute -left-40 top-0 -z-10 h-[30rem] w-[30rem] rounded-full bg-primary-light/20 blur-[120px]" aria-hidden="true" />
      <div className="absolute -bottom-52 right-0 -z-10 h-[34rem] w-[34rem] rounded-full bg-primary-strong/15 blur-[130px]" aria-hidden="true" />
      <div className="absolute inset-0 -z-10 bg-grid opacity-25" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent" aria-hidden="true" />

      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-12 lg:gap-8">
          {/* Brand */}
          <div className="lg:col-span-4">
            <Link to={ROUTES.home} className="inline-flex items-center gap-3" aria-label="Comet Healthcare home">
              <Logo markClassName="h-12 w-12" />
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-slate">
              A trusted pharmaceutical manufacturer and scientific partner, delivering affordable, reliable medicines and expert guidance across Kenya and East Africa.
            </p>
            <div className="mt-6 flex gap-2.5">
              {socials.map(({ label, node, href }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={`Follow Comet Healthcare on ${label}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/10 bg-white/80 text-primary shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary hover:text-white"
                >
                  {node}
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          <div className="lg:col-span-2">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Company</h2>
            <ul className="mt-5 space-y-3">
              {footerCompanyLinks.map((link) => (
                <li key={link.path}>
                  <Link to={link.path} className="group text-sm font-medium text-slate transition-colors hover:text-primary">
                    <span className="flex items-center gap-2">
                      <ArrowRight size={11} className="text-primary-strong opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                      {link.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Explore</h2>
            <ul className="mt-5 space-y-3">
              {footerExploreLinks.map((link) => (
                <li key={link.path}>
                  <Link to={link.path} className="group text-sm font-medium text-slate transition-colors hover:text-primary">
                    <span className="flex items-center gap-2">
                      <ArrowRight size={11} className="text-primary-strong opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                      {link.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="lg:col-span-4">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Get in touch</h2>
            <ul className="mt-5 space-y-4 text-sm text-slate">
              <li className="flex items-start gap-3">
                <MapPin size={17} className="mt-0.5 shrink-0 text-primary-strong" aria-hidden="true" />
                <span>Mua-Kitanga Road, off Mombasa Road, Machakos, Kenya</span>
              </li>
              <li>
                <a href="tel:+254725519844" className="flex items-center gap-3 font-medium transition-colors hover:text-primary">
                  <Phone size={17} className="shrink-0 text-primary-strong" aria-hidden="true" />
                  +254 725 519 844
                </a>
              </li>
              <li>
                <a href="mailto:info@comethealthcares.com" className="flex items-center gap-3 break-all font-medium transition-colors hover:text-primary">
                  <Mail size={17} className="shrink-0 text-primary-strong" aria-hidden="true" />
                  info@comethealthcares.com
                </a>
              </li>
            </ul>

            <Link
              to={ROUTES.contact}
              className="group mt-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white px-5 py-2.5 text-sm font-bold text-primary shadow-soft transition-all duration-200 hover:bg-primary hover:text-white"
            >
              Start a conversation
              <ArrowUpRight size={16} className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-primary/10 pt-6 text-xs text-slate sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Comet Healthcare Ltd. All rights reserved.</p>
          <p className="flex flex-wrap items-center gap-4">
            <span className="font-semibold text-primary">PPB Certified · GMP Compliant</span>
            <span className="h-3 w-px bg-primary/15" aria-hidden="true" />
            <span>P.O. BOX 6293, Nairobi, Kenya 00300</span>
          </p>
        </div>
      </div>
    </footer>
  )
}
