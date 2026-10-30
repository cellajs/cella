// A hard reload follows when the waiting worker has not taken control by then
const activateTimeout = 5000;
// One check per 30s: a failing page refuses many responses at once, and the frontend can roll out after its API
const updateCheckThrottle = 30 * 1000;
let lastUpdateCheck = 0;

const getRegistration = async () => ('serviceWorker' in navigator ? navigator.serviceWorker.getRegistration().catch(() => undefined) : undefined);

/** Reloads the page, handing control to a waiting service worker first: a plain reload stays on the old worker's release. */
export async function reloadApp() {
  const waiting = (await getRegistration())?.waiting;
  if (!waiting) {
    window.location.reload();
    return;
  }

  // The waiting worker takes over on SKIP_WAITING (lib/sw.ts); the page reloads once it controls this tab.
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  setTimeout(() => window.location.reload(), activateTimeout);
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

/** At boot of a reloaded tab, moves on to a waiting service worker's release. Resolves true when the page is reloading and should not render. */
export async function reloadOntoWaitingWorker() {
  const [navigation] = performance.getEntriesByType('navigation');
  if (!(navigation instanceof PerformanceNavigationTiming) || navigation.type !== 'reload') return false;
  const waiting = (await getRegistration())?.waiting;
  if (!waiting) return false;

  // No reload without the takeover: a worker that stays waiting would otherwise repeat this on every boot.
  const tookOver = await new Promise<boolean>((resolve) => {
    navigator.serviceWorker.addEventListener('controllerchange', () => resolve(true), { once: true });
    setTimeout(() => resolve(false), activateTimeout);
    waiting.postMessage({ type: 'SKIP_WAITING' });
  });
  if (tookOver) window.location.reload();
  return tookOver;
}

/** Asks the browser for a newer service worker now; one it finds installs and waits, which raises the reload prompt. */
export async function checkForUpdate() {
  if (Date.now() - lastUpdateCheck < updateCheckThrottle) return;
  lastUpdateCheck = Date.now();
  await (await getRegistration())?.update().catch(() => {});
}
