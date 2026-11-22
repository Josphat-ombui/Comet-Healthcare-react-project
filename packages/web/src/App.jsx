import { lazy, Suspense } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import { AuthProvider } from './context/AuthContext.jsx'
import { ToastProvider } from './context/ToastContext.jsx'
import { ContentProvider } from './context/ContentContext.jsx'
import { Spinner } from './components/ui/Alert.jsx'
import { ROUTES } from './lib/navigation.js'

// Code-split every route so the shell stays light (Lighthouse friendly).
const Home = lazy(() => import('./pages/Home.jsx'))
const Services = lazy(() => import('./pages/Services.jsx'))
const Experts = lazy(() => import('./pages/Experts.jsx'))
const ExpertProfile = lazy(() => import('./pages/ExpertProfile.jsx'))
const Book = lazy(() => import('./pages/Book.jsx'))
const Testimonials = lazy(() => import('./pages/Testimonials.jsx'))
const Products = lazy(() => import('./pages/Products.jsx'))
const About = lazy(() => import('./pages/About.jsx'))
const Purpose = lazy(() => import('./pages/Purpose.jsx'))
const Mission = lazy(() => import('./pages/Mission.jsx'))
const Culture = lazy(() => import('./pages/Culture.jsx'))
const Science = lazy(() => import('./pages/Science.jsx'))
const Team = lazy(() => import('./pages/Team.jsx'))
const Contact = lazy(() => import('./pages/Contact.jsx'))
const AuthPages = lazy(() => import('./pages/auth/AuthPages.jsx'))
const Portal = lazy(() => import('./pages/portal/Portal.jsx'))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function Fallback() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <Spinner label="Loading…" />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ContentProvider>
          <div className="min-h-screen flex flex-col bg-white">
            <ScrollToTop />
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-primary focus:px-5 focus:py-3 focus:text-sm focus:font-bold focus:text-white focus:shadow-pop"
            >
              Skip to content
            </a>
            {/* In dev, Vite proxies /api to the Express server on :4000 (see vite.config.js). */}
            <Navbar />
            <main id="main-content" className="flex-1">
              <Suspense fallback={<Fallback />}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/services" element={<Services />} />
                  <Route path="/experts" element={<Experts />} />
                  <Route path="/experts/:slug" element={<ExpertProfile />} />
                  <Route path="/book" element={<Book />} />
                  <Route path="/book/:slug" element={<Book />} />
                  <Route path="/testimonials" element={<Testimonials />} />
                  <Route path="/products" element={<Products />} />
                  <Route path="/about" element={<About />} />
                  {/* Canonical source-site URL, with the original short URL kept as an alias. */}
                  <Route path={ROUTES.purpose} element={<Purpose />} />
                  <Route path={ROUTES.purposeAlias} element={<Purpose />} />
                  <Route path="/mission" element={<Mission />} />
                  <Route path="/culture" element={<Culture />} />
                  <Route path="/science" element={<Science />} />
                  <Route path="/team" element={<Team />} />
                  <Route path="/contact" element={<Contact />} />
                  <Route path="/login" element={<AuthPages mode="login" />} />
                  <Route path="/register" element={<AuthPages mode="register" />} />
                  <Route path="/forgot-password" element={<AuthPages mode="forgot" />} />
                  <Route path="/reset-password" element={<AuthPages mode="reset" />} />
                  <Route path="/portal" element={<Portal view="client" />} />
                  <Route path="/portal/admin" element={<Portal view="admin" />} />
                  <Route path="*" element={<Home />} />
                </Routes>
              </Suspense>
            </main>
            <Footer />
          </div>
        </ContentProvider>
      </ToastProvider>
    </AuthProvider>
  )
}