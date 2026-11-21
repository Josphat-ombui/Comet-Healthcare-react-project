import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

export default function CTASection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-white via-primary-50 to-primary-100 py-20">
      <div className="absolute inset-0 bg-grid opacity-20" aria-hidden="true" />
      <div className="absolute -top-10 -left-10 h-96 w-96 rounded-full bg-primary-light/20 blur-3xl" aria-hidden="true" />
      <div className="absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-primary-strong/10 blur-3xl" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent" aria-hidden="true" />

      <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="mb-4 font-heading text-3xl font-extrabold tracking-[-0.03em] text-ink md:text-4xl lg:text-5xl text-balance">
          Have a product question worth an expert's time?
        </h2>
        <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-slate">
          Book a direct consultation or start the conversation with our business development team —
          from formulation to registration, we've done it before.
        </p>
        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <Link
            to="/book"
            className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-primary-strong px-8 py-3.5 text-sm font-bold text-white shadow-[0_14px_30px_-12px_rgba(0,82,204,0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-12px_rgba(0,123,255,0.8)]"
          >
            Book a Consultation <ArrowRight size={16} aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
          <Link
            to="/contact"
            className="btn btn-outline btn-lg !px-8 backdrop-blur-md"
          >
            Send an Inquiry
          </Link>
        </div>
      </div>
    </section>
  )
}
