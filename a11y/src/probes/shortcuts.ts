import { readFileSync } from 'node:fs';
import path from 'node:path';
import { appConfig } from 'shared';
import { characterShortcuts } from '../code-checks.ts';
import type { Check } from '../findings.ts';
import { ensureOpen, overlaySelector } from '../scope.ts';
import { repoRoot, settle } from '../session.ts';

/**
 * Where the app keeps its switch for character-key shortcuts: the state whose own shortcut opens it, the section that
 * holds the preference, and the preference itself (locale keys). An app with other shortcuts adjusts these.
 */
const preference = { state: 'menu-sheet', section: 'preferences', toggle: 'keyboard_shortcuts' };

/**
 * Character key shortcuts (2.1.4): a shortcut made of a letter alone, or with Shift, fires by accident for people who
 * dictate. The code is searched for such shortcuts; when there are any, the preference is switched off in the browser
 * and the state's own shortcut must no longer open it. It changes a stored preference, so it runs last in a visit.
 */
export const shortcutsOff: Check = async (page, state) => {
  if (state.id !== preference.state || !state.open) return [];
  const finding = { criteria: ['2.1.4'], check: 'probe:shortcuts', what: 'Keyboard shortcuts need Ctrl, Alt or Meta, or can be turned off' };
  const shortcuts = characterShortcuts();
  if (!shortcuts.length) return [{ ...finding, problems: [] }];

  const names = JSON.parse(readFileSync(path.join(repoRoot, 'locales', appConfig.defaultLanguage, 'common.json'), 'utf8')) as Record<string, string>;
  await ensureOpen(page, state);
  const toggle = page.getByRole('switch', { name: names[preference.toggle] });
  if (!(await toggle.isVisible())) {
    await page
      .getByRole('button', { name: names[preference.section] })
      .first()
      .click({ timeout: 3000 })
      .catch(() => undefined);
    await settle(page);
  }
  if (!(await toggle.isVisible())) return [{ ...finding, problems: [`${shortcuts.join(', ')} with no preference to turn them off`] }];

  await toggle.click();
  // The first Escape may only close the section that holds the preference
  for (let presses = 0; presses < 3 && (await page.locator(overlaySelector).count()); presses++) {
    await page.keyboard.press('Escape');
    await page.waitForFunction((selector) => !document.querySelector(selector), overlaySelector, { timeout: 1500 }).catch(() => undefined);
  }
  if (await page.locator(overlaySelector).count()) throw new Error('the overlay did not close, so the shortcut could not be tried');
  await state.open(page);
  const opened = (await page.locator(overlaySelector).count()) > 0;
  return [{ ...finding, problems: opened ? ['the shortcut still works after keyboard shortcuts are turned off'] : [] }];
};
