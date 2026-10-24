// A modal dialog hides everything outside it from screen readers, so each dialog gets a region of its own
const regions = new WeakMap<Element, HTMLElement>();

function regionFor(element: Element) {
  const host = element.closest('[role="dialog"], [role="alertdialog"]') ?? document.body;
  let region = regions.get(host);
  if (!region?.isConnected) {
    region = document.createElement('div');
    region.setAttribute('role', 'status');
    region.className = 'sr-only';
    host.append(region);
    regions.set(host, region);
  }
  return region;
}

/** Creates the live region for `element` ahead of its first message: a screen reader reads changes to a region it already knows. */
export function prepareAnnouncement(element: Element) {
  regionFor(element);
}

/** Reads `message` out politely, from the live region of the dialog around `element` or of the page. */
export function announce(element: Element, message: string) {
  const region = regionFor(element);
  region.textContent = '';
  // Set a frame later, so the same message twice in a row still counts as a change
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}
