import type { Check } from '../findings.ts';
import { overlaySelector } from '../scope.ts';

const tooltip = '[data-slot="tooltip-content"], [role="tooltip"]';

/**
 * Hover content (1.4.13): a tooltip must stay while the pointer moves onto it, and close with Escape without moving
 * the pointer. Escape may also close the state's overlay, so the visit reopens it afterwards.
 */
export const tooltips: Check = async (page, state) => {
  const problems: string[] = [];
  let tested = false;
  // Under an open overlay only its own triggers can be hovered
  const root = state.overlay ? page.locator(overlaySelector).last() : page;
  const triggers = root.locator('[data-slot="tooltip-trigger"]:visible');
  const content = page.locator(tooltip).last();
  const shown = () =>
    content.waitFor({ state: 'visible', timeout: 1500 }).then(
      () => true,
      () => false,
    );

  const count = Math.min(await triggers.count(), 2);
  for (let i = 0; i < count; i++) {
    const trigger = triggers.nth(i);
    const hover = () =>
      trigger.hover({ timeout: 1000 }).then(
        () => true,
        () => false,
      );
    const label = await trigger.getAttribute('aria-label', { timeout: 3000 }).catch(() => null);
    const name = (label ?? (await trigger.innerText({ timeout: 3000 }).catch(() => ''))).trim().slice(0, 30) || 'tooltip trigger';

    // A covered trigger cannot be hovered; skip it
    if (!(await hover()) || !(await shown())) continue;
    tested = true;

    const box = await content.boundingBox();
    if (box) {
      // One jump: a pointer resting in the gap between trigger and tooltip would test the close delay, not hoverability
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(300);
      if (!(await content.isVisible())) problems.push(`tooltip of "${name}" disappears when the pointer moves onto it`);
    }
    if (!(await hover()) || !(await shown())) continue;
    await page.keyboard.press('Escape');
    const closed = await content.waitFor({ state: 'hidden', timeout: 2500 }).then(
      () => true,
      () => false,
    );
    if (!closed) problems.push(`tooltip of "${name}" stays after Escape`);
    await page.mouse.move(0, 0);
  }

  if (!tested) return [];
  return [{ criteria: ['1.4.13'], check: 'probe:hover-content', what: 'Tooltips are hoverable and dismissible with Escape', problems }];
};

/**
 * Status messages (4.1.3): a toast must render inside a live region. An unknown sign-in email makes the app answer
 * with a message the user did not focus. Toasts close by themselves, so this runs first in a visit.
 */
export const statusMessages: Check = async (page, state) => {
  if (state.id !== 'sign-in-email') return [];
  const problems = await page.evaluate(() => {
    const toasts = [...document.querySelectorAll('[data-slot="toast"]')];
    if (!toasts.length) return null;
    const live = (el: Element) => el.closest('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]');
    return toasts.filter((toast) => !live(toast)).map((toast) => `toast "${toast.textContent?.trim().slice(0, 40)}" is not in a live region`);
  });
  if (!problems) return [];
  return [{ criteria: ['4.1.3'], check: 'probe:status-messages', what: 'Status messages render inside a live region', problems }];
};
