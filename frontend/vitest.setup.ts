import '@testing-library/jest-dom';

// Entegrasyon testlerinde API ve MSW handler'larının aynı base URL kullanması için
process.env.NEXT_PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Node.js 18+ ortamında fetch global olarak mevcut, polyfill'e gerek yok.
// MSW setup'ı her test dosyasının kendi içinde yapılacak.

// jsdom'da scrollIntoView yok; ProChatPanel gibi bileşenler için mock
const noop = () => {};
if (
  typeof HTMLElement !== 'undefined' &&
  typeof HTMLElement.prototype.scrollIntoView !== 'function'
) {
  HTMLElement.prototype.scrollIntoView = noop;
}
if (
  typeof Element !== 'undefined' &&
  typeof Element.prototype.scrollIntoView !== 'function'
) {
  Element.prototype.scrollIntoView = noop;
}

// input-otp (and similar) use ResizeObserver; jsdom does not provide it.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver =
    ResizeObserverMock as unknown as typeof ResizeObserver;
}
