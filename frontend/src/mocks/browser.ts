import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

const worker = setupWorker(...handlers);

// Enable mocking in development
// https://mswjs.io/docs/getting-started/integrate/node
export async function enableMocking() {
  if (process.env.NODE_ENV !== 'development') return;
  // Ignore requests that not /mock/kanban
  worker.events.on('request:start', ({ request }) => {
    const urlObject = new URL(request.url);
    if (!urlObject.pathname.startsWith('/mock/')) return;
  });
  // `worker.start()` returns a Promise that resolves
  // once the Service Worker is up and ready to intercept requests.
  return worker.start({
    onUnhandledRequest: 'bypass',
    quiet: true,
  });
}

export async function stopMocking() {
  return worker.stop();
}
