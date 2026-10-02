import type { ElementHandle, Page } from 'playwright';
import type { ScopeState } from '../scope.ts';
import { devOnlySelectors, type Session } from '../session.ts';
import { type EvidenceSet, visit } from './visit.ts';

const maxSteps = 60;

const withoutHash = (url: string) => url.split('#')[0];

interface Stop {
  key: string;
  name: string;
  obscured: boolean;
  /** Inside the overlay that was open when the walk started; null when no overlay was open. */
  inOverlay: boolean | null;
  editable: boolean;
}

/** Overlays that hold focus while open. Toasts render as dialogs but never take focus. */
const overlaySelector = '[role="dialog"]:not([data-slot^="toast"]), [role="alertdialog"]:not([data-slot^="toast"]), [role="menu"], [role="listbox"]';

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
      if (rect.width > 2 && rect.height > 2) {
        const inset = 2;
        const points = [
          [rect.left + rect.width / 2, rect.top + rect.height / 2],
          [rect.left + inset, rect.top + inset],
          [rect.right - inset, rect.top + inset],
          [rect.left + inset, rect.bottom - inset],
          [rect.right - inset, rect.bottom - inset],
        ];
        obscured = points.every(([x, y]) => {
          const hit = document.elementFromPoint(x, y);
          return !hit || !(el.contains(hit) || hit.contains(el));
        });
      }
      const open = document.querySelectorAll(overlays);
      const inOverlay = open.length ? [...open].some((overlay) => overlay.contains(el)) : null;
      const editable = el.matches(
        'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, [contenteditable="true"]',
      );
      return { key: parts.join('>'), name: `${el.tagName.toLowerCase()} "${name}"`, obscured, inOverlay, editable };
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
 * Tabs through each state: focus must show (2.4.7), never be entirely covered (2.4.11), never change the page by
 * itself (3.2.1), never get stuck and close overlays with Escape (2.1.2), and stay inside an open overlay (2.4.3).
 */
export async function probeKeyboard(session: Session, states: ScopeState[], evidence: EvidenceSet) {
  const results = await visit(session, states, {}, async (page, state) => {
    const startUrl = page.url();
    const invisible: string[] = [];
    const obscured: string[] = [];
    const contextChanges: string[] = [];
    const traps: string[] = [];
    const escapes: string[] = [];
    const seen = new Set<string>();
    const order: string[] = [];
    const overlayOpen = (await page.locator(overlaySelector).count()) > 0;

    // Outside overlays the unfocused look is captured by blurring; inside one, blurring could close it
    let previous: { handle: ElementHandle; clip: { x: number; y: number; width: number; height: number }; image: Buffer; name: string } | null = null;
    let repeats = 0;
    let lastKey = '';

    for (let step = 0; step < maxSteps; step++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(120);

      if (previous) {
        const after = await shot(page, previous.clip).catch(() => null);
        if (after?.equals(previous.image)) invisible.push(previous.name);
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
      if (stop.obscured) obscured.push(stop.name);
      // A text field shows focus with its caret, which screenshots hide
      if (stop.editable) continue;

      const handle = (await page.evaluateHandle(() => document.activeElement)).asElement();
      const clip = handle && (await focusBox(page, handle).catch(() => null));
      if (!handle || !clip) continue;
      const focused = await shot(page, clip).catch(() => null);
      if (!focused) continue;
      if (overlayOpen) {
        previous = { handle, clip, image: focused, name: stop.name };
        continue;
      }
      await handle.evaluate((el) => (el as HTMLElement).blur());
      await page.waitForTimeout(120);
      const unfocused = await shot(page, clip).catch(() => null);
      if (unfocused?.equals(focused)) invisible.push(stop.name);
      await handle.focus();
    }

    // When focus already left the overlay, that is the finding; Escape would go to the page behind it
    if (state.open && !escapes.length) {
      // Escape goes to the focused element, so put focus back inside the overlay first
      await page
        .locator(overlaySelector)
        .last()
        .evaluate((overlay) => {
          const target = overlay.querySelector<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])') ?? (overlay as HTMLElement);
          target.focus();
        })
        .catch(() => undefined);
      const before = await page.locator(overlaySelector).count();
      await page.keyboard.press('Escape');
      // Closing animations keep the overlay in the DOM for a moment
      await page.waitForTimeout(1200);
      if (before > 0 && (await page.locator(overlaySelector).count()) >= before) traps.push('Escape does not close the open overlay');
    }

    return { invisible, obscured, contextChanges, traps, escapes, order };
  });

  const pick = (field: 'invisible' | 'obscured' | 'contextChanges' | 'traps' | 'escapes') =>
    new Map([...results].map(([id, result]) => [id, [...new Set(result[field])]]));

  evidence.addFromProblems(['2.4.7'], 'probe:keyboard', 'A visible change on every element that receives keyboard focus', pick('invisible'));
  evidence.addFromProblems(['2.4.11'], 'probe:keyboard', 'Focused elements are never entirely covered by other content', pick('obscured'));
  evidence.addFromProblems(['3.2.1'], 'probe:keyboard', 'Moving focus never navigates or opens anything', pick('contextChanges'));
  evidence.addFromProblems(['2.1.2'], 'probe:keyboard', 'Focus never gets stuck, and Escape closes overlays', pick('traps'));

  const overlays = new Map([...pick('escapes')].filter(([id]) => states.find((state) => state.id === id)?.open));
  evidence.addFromProblems(['2.4.3'], 'probe:keyboard', 'Focus stays inside an open overlay', overlays);

  // The focus order needs a person, so record it as material to review
  const orders = [...results].map(([id, result]) => `${id}: ${result.order.slice(0, 12).join(' → ')}`);
  evidence.add(['2.4.3', '2.1.1'], {
    check: 'probe:keyboard',
    result: 'review',
    summary: `Tab order recorded on ${results.size} states for a person to compare with the visual order. ${orders.slice(0, 3).join(' | ')}`,
    where: [...results.keys()],
  });
}
