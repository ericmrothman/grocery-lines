export function keepForRepeatVisits(browser = globalThis.navigator) {
  if (!browser?.serviceWorker) return Promise.resolve(null);
  return browser.serviceWorker.register(new URL('../../../service-worker.js', import.meta.url)).catch(() => null);
}
