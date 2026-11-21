import '@testing-library/jest-dom/vitest'

globalThis.fetch = () => Promise.reject(new TypeError('network is stubbed in tests'))
window.scrollTo = () => {}

if (!window.IntersectionObserver) {
  class MockIntersectionObserver {
    constructor(cb) {
      this.cb = cb
    }
    observe(el) {
      this.cb([{ isIntersecting: true, target: el }], this)
    }
    unobserve() {}
    disconnect() {}
  }
  window.IntersectionObserver = MockIntersectionObserver
}