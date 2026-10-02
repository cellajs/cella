import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Check } from './findings.ts';
import { devOnlySelectors } from './session.ts';

/** Where the audit leaves, per state, what a reviewer (a person or an agent) needs to judge the criteria no tool decides. */
const reviewDir = path.join(import.meta.dirname, '../results/review');

/** Adds a file to a state's review packet. */
export function writePacketFile(stateId: string, name: string, content: string | Buffer) {
  const dir = path.join(reviewDir, stateId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, name), content);
}

/** What the page states about itself, for the criteria that compare it with what is visible. */
function pageFacts() {
  const text = (el: Element | null) => (el?.textContent ?? '').trim().replace(/\s+/g, ' ');
  const visible = (el: Element) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1 && getComputedStyle(el).visibility !== 'hidden';
  };
  const labelOf = (el: Element) =>
    el.getAttribute('aria-label') ??
    (el.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/)
      .map((id) => text(document.getElementById(id)))
      .join(' ')
      .trim();

  const controls = [...document.querySelectorAll('button, a[href], [role="button"], [role="link"], [role="tab"], [role="menuitem"]')].filter(visible);
  return {
    title: document.title,
    lang: document.documentElement.lang,
    headings: [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')]
      .filter(visible)
      .map((el) => ({ level: Number(el.getAttribute('aria-level') ?? el.tagName.slice(1)), text: text(el).slice(0, 80) })),
    landmarks: [
      ...document.querySelectorAll('main, nav, header, footer, aside, form[aria-label], [role="main"], [role="navigation"], [role="search"]'),
    ]
      .filter(visible)
      .map((el) => `${el.getAttribute('role') ?? el.tagName.toLowerCase()}${labelOf(el) ? ` "${labelOf(el)}"` : ''}`),
    images: [...document.querySelectorAll('img, svg[role="img"], [role="img"]')].filter(visible).map((el) => ({
      name: el.getAttribute('alt') ?? labelOf(el),
      decorative: el.getAttribute('alt') === '' || el.getAttribute('aria-hidden') === 'true',
      source: (el.getAttribute('src') ?? el.tagName.toLowerCase()).split('/').pop()?.slice(0, 60),
      within: text(el.closest('a, button, figure')).slice(0, 60),
    })),
    // 2.5.3: a control whose accessible name does not contain its visible text cannot be called by voice
    labelNotInName: controls
      .filter((el) => labelOf(el) && text(el) && !labelOf(el).toLowerCase().includes(text(el).toLowerCase()))
      .map((el) => ({ visible: text(el).slice(0, 60), name: labelOf(el).slice(0, 60) })),
    fields: [
      ...document.querySelectorAll<HTMLInputElement>(
        'input:not([type="hidden"]), textarea, select, [role="combobox"], [role="switch"], [role="checkbox"]',
      ),
    ]
      .filter(visible)
      .map((el) => ({
        label: (el.labels?.[0] ? text(el.labels[0]) : '') || labelOf(el),
        type: el.getAttribute('type') ?? el.getAttribute('role') ?? el.tagName.toLowerCase(),
        required: el.required || el.getAttribute('aria-required') === 'true',
        placeholder: el.getAttribute('placeholder') ?? '',
        description: (el.getAttribute('aria-describedby') ?? '')
          .split(/\s+/)
          .map((id) => text(document.getElementById(id)))
          .join(' ')
          .trim(),
      })),
    otherLanguages: [...document.querySelectorAll('[lang]')]
      .filter((el) => el !== document.documentElement && visible(el))
      .map((el) => ({ lang: el.getAttribute('lang'), text: text(el).slice(0, 60) })),
    liveRegions: [...document.querySelectorAll('[aria-live], [role="status"], [role="alert"], [role="log"]')].map(
      (el) => `${el.getAttribute('role') ?? 'aria-live'}=${el.getAttribute('aria-live') ?? 'implicit'}: ${text(el).slice(0, 60)}`,
    ),
  };
}

/**
 * Saves the state's review packet: a screenshot, the accessibility tree a screen reader works from, and facts about
 * the page. It decides nothing; the `a11y-review` skill describes how a reviewer uses it.
 */
export const reviewPacket: Check = async (page, state) => {
  // Development-only tools are not part of the product
  const hidden = await page.addStyleTag({ content: `${devOnlySelectors.join(', ')} { display: none !important; }` });
  writePacketFile(state.id, 'screenshot.png', await page.screenshot({ fullPage: !state.open, animations: 'disabled' }));
  writePacketFile(state.id, 'tree.yml', await page.locator('body').ariaSnapshot());
  writePacketFile(state.id, 'facts.json', `${JSON.stringify(await page.evaluate(pageFacts), null, 2)}\n`);
  await hidden.evaluate((element) => (element as Element).remove());
  return [];
};
