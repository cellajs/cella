import type { ElementHandle, Page } from 'playwright';
import type { Check } from '../findings.ts';
import { writePacketFile } from '../review-packet.ts';
import { overlaySelector } from '../scope.ts';
import { devOnlySelectors } from '../session.ts';

const maxSteps = 60;

const withoutHash = (url: string) => url.split('#')[0];

interface Stop {
  key: string;
  name: string;
  /** Top-left corner on the page, to compare the Tab order with the visual order. */
  x: number;
  y: number;
  obscured: boolean;
  coveredBy: string;
  /** Inside the overlay that was open when the walk started; null when no overlay was open. */
  inOverlay: boolean | null;
  editable: boolean;
  /** Tag, role and classes: elements of one kind share their focus styling, so one of them is checked for it. */
  kind: string;
}

/** Two animation frames: enough for the browser to move focus and paint its styles. */
const painted = (page: Page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

/** Describes the focused element, and whether other content covers all of it. */
function readFocus(page: Page, devOnly: string[]) {
  return page.evaluate(
    ([skip, overlays]): Stop | null => {
      const el = document.activeElement;
      if (!el || el === document.body || skip.some((selector) => el.closest(selector))) return null;
      const parts: string[] = [];
      for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
        parts.unshift(`${node.tagName.toLowerCase()}:${node.parentElement ? [...node.parentElement.children].indexOf(node) : 0}`);
      }
      const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName)
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 40);
      const rect = el.getBoundingClientRect();
      let obscured = false;
      let coveredBy = 'nothing at its position';
      if (rect.width > 2 && rect.height > 2) {
        const inset = 2;
        const points = [
          [rect.left + rect.width / 2, rect.top + rect.height / 2],
          [rect.left + inset, rect.top + inset],
          [rect.right - inset, rect.top + inset],
          [rect.left + inset, rect.bottom - inset],
          [rect.right - inset, rect.bottom - inset],
        ];
        const cover = points.map(([x, y]) => document.elementFromPoint(x, y));
        obscured = cover.every((hit) => !hit || !(el.contains(hit) || hit.contains(el)));
        // Name what lies on top, so the finding points at the element to fix
        const top = cover[0];
        if (obscured && top) coveredBy = `${top.tagName.toLowerCase()}${top.id ? `#${top.id}` : ''}.${[...top.classList].slice(0, 3).join('.')}`;
      }
      const open = document.querySelectorAll(overlays);
      const inOverlay = open.length ? [...open].some((overlay) => overlay.contains(el)) : null;
      const editable = el.matches(
        'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, [contenteditable="true"]',
      );
      const kind = `${el.tagName}|${el.getAttribute('role') ?? ''}|${el.getAttribute('class') ?? ''}`;
      const [x, y] = [Math.round(rect.left + window.scrollX), Math.round(rect.top + window.scrollY)];
      return { key: parts.join('>'), name: `${el.tagName.toLowerCase()} "${name}"`, x, y, obscured, coveredBy, inOverlay, editable, kind };
    },
    [devOnly, overlaySelector] as const,
  );
}

/** The area a focus indicator can occupy: the element, or the grid cell or row that styles focus for it. */
async function focusBox(page: Page, handle: ElementHandle) {
  const box = await handle.evaluate((node) => {
    const el = node as Element;
    const host =
      el.closest(
        '[role="gridcell"], [role="columnheader"], [role="rowheader"], [role="cell"], [role="row"], [role="option"], [role="menuitem"], [role="tab"], [role="treeitem"]',
      ) ?? el;
    const a = el.getBoundingClientRect();
    const b = host.getBoundingClientRect();
    const left = Math.min(a.left, b.left);
    const top = Math.min(a.top, b.top);
    return { x: left, y: top, width: Math.max(a.right, b.right) - left, height: Math.max(a.bottom, b.bottom) - top };
  });
  const viewport = page.viewportSize();
  if (!viewport || box.width < 2 || box.height < 2) return null;
  const pad = 4;
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const width = Math.min(viewport.width, box.x + box.width + pad) - x;
  const height = Math.min(viewport.height, box.y + box.height + pad) - y;
  return width >= 2 && height >= 2 ? { x, y, width, height } : null;
}

const shot = (page: Page, clip: { x: number; y: number; width: number; height: number }) =>
  page.screenshot({ clip, animations: 'disabled', caret: 'hide' });

/**
 * Tabs through the page: focus must show (2.4.7), never be entirely covered (2.4.11), never change the page by itself
 * (3.2.1), never get stuck and close overlays with Escape (2.1.2), and stay inside an open overlay (2.4.3). Escape
 * closes the state's overlay, so this runs last among the checks that need it open.
 */
export const keyboardWalk: Check = async (page, state) => {
  const startUrl = page.url();
  const invisible: string[] = [];
  const obscured: string[] = [];
  const contextChanges: string[] = [];
  const traps: string[] = [];
  const escapes: string[] = [];
  const seen = new Set<string>();
  const shotKinds = new Set<string>();
  const order: string[] = [];
  const stops: { name: string; x: number; y: number }[] = [];
  const overlayOpen = (await page.locator(overlaySelector).count()) > 0;

  // The element focus just left, to compare its focused look with how it looks now. Blurring it would not do: a grid
  // keeps its selected-cell ring until another cell takes over, and a blur can close an overlay.
  let previous: { handle: ElementHandle; width: number; height: number; image: Buffer; name: string } | null = null;
  let repeats = 0;
  let lastKey = '';

  for (let step = 0; step < maxSteps; step++) {
    await page.keyboard.press('Tab');
    await painted(page);

    if (previous) {
      // Measured again: moving focus may have scrolled the page. A box cut differently by the viewport cannot be compared.
      const clip = await focusBox(page, previous.handle).catch(() => null);
      if (clip && clip.width === previous.width && clip.height === previous.height) {
        const after = await shot(page, clip).catch(() => null);
        if (after?.equals(previous.image)) invisible.push(previous.name);
      }
      previous = null;
    }

    // Scroll spies update the hash as focus scrolls the page, which is not a change of context
    if (withoutHash(page.url()) !== withoutHash(startUrl)) {
      contextChanges.push(`focus moved the page to ${new URL(page.url()).pathname}`);
      break;
    }

    const stop = await readFocus(page, devOnlySelectors);
    if (!stop) {
      if (overlayOpen) escapes.push('focus falls back to the page body');
      continue;
    }
    if (overlayOpen && stop.inOverlay === false) escapes.push(`focus reaches ${stop.name} behind the open overlay`);
    repeats = stop.key === lastKey ? repeats + 1 : 0;
    lastKey = stop.key;
    if (repeats >= 3) {
      traps.push(`focus stays on ${stop.name}`);
      break;
    }
    if (seen.has(stop.key)) break; // Wrapped around: every stop has been visited
    seen.add(stop.key);
    order.push(stop.name);
    stops.push({ name: stop.name, x: stop.x, y: stop.y });
    if (stop.obscured) obscured.push(`${stop.name} is covered by ${stop.coveredBy}`);
    // A text field shows focus with its caret, which screenshots hide
    if (stop.editable || shotKinds.has(stop.kind)) continue;
    shotKinds.add(stop.kind);

    const handle = (await page.evaluateHandle(() => document.activeElement)).asElement();
    const clip = handle && (await focusBox(page, handle).catch(() => null));
    if (!handle || !clip) continue;
    const focused = await shot(page, clip).catch(() => null);
    if (focused) previous = { handle, width: clip.width, height: clip.height, image: focused, name: stop.name };
  }

  // When focus already left the overlay, that is the finding; Escape would go to the page behind it
  if (overlayOpen && state.overlay && !escapes.length) {
    // Escape goes to the focused element, so put focus back inside the overlay first
    await page
      .locator(overlaySelector)
      .last()
      .evaluate((overlay) => {
        const target = overlay.querySelector<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])') ?? (overlay as HTMLElement);
        target.focus();
      })
      .catch(() => undefined);
    const open = await page.locator(overlaySelector).count();
    await page.keyboard.press('Escape');
    // Closing animations keep the overlay in the DOM for a moment
    const closed = await page
      .waitForFunction(([selector, count]) => document.querySelectorAll(selector).length < count, [overlaySelector, open] as const, { timeout: 2000 })
      .then(
        () => true,
        () => false,
      );
    if (!closed) traps.push('Escape does not close the open overlay');
  }

  writePacketFile(state.id, 'tab-order.json', `${JSON.stringify(stops, null, 2)}\n`);

  const probe = { check: 'probe:keyboard' };
  const unique = (list: string[]) => [...new Set(list)];
  const findings: Awaited<ReturnType<Check>> = [
    { ...probe, criteria: ['2.4.7'], what: 'A visible change on every element that receives keyboard focus', problems: unique(invisible) },
    { ...probe, criteria: ['2.4.11'], what: 'Focused elements are never entirely covered by other content', problems: unique(obscured) },
    { ...probe, criteria: ['3.2.1'], what: 'Moving focus never navigates or opens anything', problems: unique(contextChanges) },
    { ...probe, criteria: ['2.1.2'], what: 'Focus never gets stuck, and Escape closes overlays', problems: unique(traps) },
    // The focus order needs a person, so record it as material to review
    {
      ...probe,
      criteria: ['2.4.3', '2.1.1'],
      what: 'Tab order recorded for a person to compare with the visual order.',
      problems: [],
      review: order.slice(0, 12).join(' → '),
    },
  ];
  if (state.overlay) {
    findings.push({ ...probe, criteria: ['2.4.3'], what: 'Focus stays inside an open overlay', problems: unique(escapes) });
  }
  return findings;
};
