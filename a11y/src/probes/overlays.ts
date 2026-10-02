import type { ScopeState } from '../scope.ts';
import type { Session } from '../session.ts';
import { type EvidenceSet, visit } from './visit.ts';

const tooltip = '[data-slot="tooltip-content"], [role="tooltip"]';

/**
 * Hover content (1.4.13): a tooltip must stay while the pointer moves onto it, and close with Escape without moving
 * the pointer. Status messages (4.1.3): a toast must render inside a live region.
 */
export async function probeOverlays(session: Session, states: ScopeState[], evidence: EvidenceSet) {
  const hover = await visit(session, states, {}, async (page) => {
    const problems: string[] = [];
    let tested = false;
    const triggers = page.locator('[data-slot="tooltip-trigger"]:visible');
    const count = Math.min(await triggers.count(), 2);
    for (let i = 0; i < count; i++) {
      const trigger = triggers.nth(i);
      const label = await trigger.getAttribute('aria-label', { timeout: 3000 }).catch(() => null);
      const name = (label ?? (await trigger.innerText({ timeout: 3000 }).catch(() => ''))).trim().slice(0, 30) || 'tooltip trigger';
      // A trigger under an open dialog cannot be hovered; skip it
      const hovered = await trigger.hover({ timeout: 3000 }).then(
        () => true,
        () => false,
      );
      if (!hovered) continue;
      await page.waitForTimeout(900);
      const content = page.locator(tooltip).last();
      if (!(await content.isVisible())) continue;
      tested = true;

      const box = await content.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
        await page.waitForTimeout(400);
        if (!(await content.isVisible())) problems.push(`tooltip of "${name}" disappears when the pointer moves onto it`);
      }
      if (
        !(await trigger.hover({ timeout: 3000 }).then(
          () => true,
          () => false,
        ))
      )
        continue;
      await page.waitForTimeout(600);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      if (await page.locator(tooltip).last().isVisible()) problems.push(`tooltip of "${name}" stays after Escape`);
      await page.mouse.move(0, 0);
    }
    return tested ? problems : null;
  });
  const withTooltips = new Map([...hover].filter((entry): entry is [string, string[]] => entry[1] !== null));
  if (withTooltips.size)
    evidence.addFromProblems(['1.4.13'], 'probe:hover-content', 'Tooltips are hoverable and dismissible with Escape', withTooltips);

  // Unknown sign-in email: the app answers with a message the user did not focus
  const signIn = states.filter((state) => state.id === 'sign-in-email');
  const messages = await visit(session, signIn, {}, (page) =>
    page.evaluate(() => {
      const toasts = [...document.querySelectorAll('[data-slot="toast"]')];
      if (!toasts.length) return null;
      const live = (el: Element) => el.closest('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]');
      return toasts.filter((toast) => !live(toast)).map((toast) => `toast "${toast.textContent?.trim().slice(0, 40)}" is not in a live region`);
    }),
  );
  const shown = new Map([...messages].filter((entry): entry is [string, string[]] => entry[1] !== null));
  if (shown.size) evidence.addFromProblems(['4.1.3'], 'probe:status-messages', 'Status messages render inside a live region', shown);
}
