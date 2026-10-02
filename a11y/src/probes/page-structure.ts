import { readFileSync } from 'node:fs';
import path from 'node:path';
import { appConfig } from 'shared';
import type { Check, Finding } from '../findings.ts';
import { repoRoot, settle } from '../session.ts';

const titles = { criteria: ['2.4.2'], check: 'probe:titles', what: 'A distinct, descriptive page title' };
const language = { criteria: ['3.1.1'], check: 'probe:language', what: 'The page language follows the language the user picks' };

/** Title (2.4.2), a main landmark or skip link (2.4.1) and the declared language (3.1.1) of a page. */
export const pageStructure: Check = async (page, state) => {
  if (state.open) return [];
  const title = await page.title();
  const lang = await page.evaluate(() => document.documentElement.lang);
  const bypass = await page.evaluate(() => {
    if (document.querySelector('main, [role="main"]')) return true;
    const first = document.querySelector<HTMLAnchorElement>('a[href^="#"]');
    return !!(first?.hash && document.getElementById(first.hash.slice(1)));
  });

  return [
    { ...titles, value: title, problems: !title.trim() || title === appConfig.name ? [`title is "${title}", which names no page`] : [] },
    {
      criteria: ['2.4.1'],
      check: 'probe:landmarks',
      what: 'A main landmark or skip link to bypass repeated navigation',
      problems: bypass ? [] : ['no main landmark and no skip link'],
    },
    { ...language, problems: lang === appConfig.defaultLanguage ? [] : [`lang="${lang}" on an ${appConfig.defaultLanguage} page`] },
  ];
};

/**
 * Picks every other language with the app's own switcher and reads the declared page language. It changes the stored
 * language, so it runs last in a visit. Pages without a switcher return nothing.
 */
export const languageSwitch: Check = async (page, state) => {
  if (state.open) return [];
  const names = JSON.parse(readFileSync(path.join(repoRoot, 'locales', appConfig.defaultLanguage, 'common.json'), 'utf8')) as Record<string, string>;
  const findings: Awaited<ReturnType<Check>> = [];

  for (const other of appConfig.languages.filter((lng) => lng !== appConfig.defaultLanguage)) {
    const button = page.getByRole('button', { name: /change language/i }).first();
    if (!(await button.count())) break;
    const label = names[other] ?? other;
    await button.click();
    await page
      .getByRole('menuitem', { name: label })
      .or(page.getByRole('menuitemradio', { name: label }))
      .first()
      .click();
    await settle(page);
    const lang = await page.evaluate(() => document.documentElement.lang);
    findings.push({ ...language, value: other, problems: lang === other ? [] : [`after choosing ${label}, <html lang="${lang}">`] });
  }
  return findings;
};

/** Checks that compare states with each other: a title shared by two pages, and whether any page offered a language switch. */
export function acrossStates(findings: Finding[]): Finding[] {
  const titled = findings.filter((finding) => finding.check === titles.check);
  for (const finding of titled) {
    const twins = titled.filter((other) => other !== finding && other.value === finding.value).map((other) => other.state);
    if (twins.length) finding.problems.push(`"${finding.value}" is also the title of ${twins.join(', ')}`);
  }

  // A language finding with a value is one made after switching; label it so it reads apart from the default-language one
  const switched = findings.filter((finding) => finding.check === language.check && finding.value);
  for (const finding of switched) finding.state = `${finding.state} (${finding.value})`;
  const checkedDefault = findings.some((finding) => finding.check === language.check);
  if (checkedDefault && !switched.length) {
    return [
      ...findings,
      { ...language, state: 'all pages', problems: [], review: 'No page offers a language switcher, so no other language was checked.' },
    ];
  }
  return findings;
}
