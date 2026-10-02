import { readFileSync } from 'node:fs';
import path from 'node:path';
import { appConfig } from 'shared';
import type { ScopeState } from '../scope.ts';
import { repoRoot, type Session } from '../session.ts';
import { type EvidenceSet, visit } from './visit.ts';

/** Titles (2.4.2), a main landmark or skip link (2.4.1) and the page language (3.1.1). */
export async function probePageStructure(session: Session, states: ScopeState[], evidence: EvidenceSet) {
  const pages = states.filter((state) => !state.open);

  const found = await visit(session, pages, {}, async (page) => ({
    title: await page.title(),
    lang: await page.evaluate(() => document.documentElement.lang),
    bypass: await page.evaluate(() => {
      if (document.querySelector('main, [role="main"]')) return 'main landmark';
      const first = document.querySelector<HTMLAnchorElement>('a[href^="#"]');
      const target = first?.hash && document.getElementById(first.hash.slice(1));
      return target ? 'skip link' : null;
    }),
  }));

  const titles = new Map<string, string[]>();
  const byTitle = new Map<string, string[]>();
  for (const [id, { title }] of found) byTitle.set(title, [...(byTitle.get(title) ?? []), id]);
  for (const [id, { title }] of found) {
    const problems: string[] = [];
    if (!title.trim() || title === appConfig.name) problems.push(`title is "${title}", which names no page`);
    const twins = (byTitle.get(title) ?? []).filter((other) => other !== id);
    if (twins.length) problems.push(`"${title}" is also the title of ${twins.join(', ')}`);
    titles.set(id, problems);
  }
  evidence.addFromProblems(['2.4.2'], 'probe:titles', 'A distinct, descriptive page title', titles);

  const bypass = new Map([...found].map(([id, { bypass }]) => [id, bypass ? [] : ['no main landmark and no skip link']]));
  evidence.addFromProblems(['2.4.1'], 'probe:landmarks', 'A main landmark or skip link to bypass repeated navigation', bypass);

  // The page language must follow the language the user picks, so pick each one with the app's own switcher
  const language = new Map<string, string[]>();
  for (const [id, { lang }] of found)
    language.set(id, lang === appConfig.defaultLanguage ? [] : [`lang="${lang}" on an ${appConfig.defaultLanguage} page`]);
  const names = JSON.parse(readFileSync(path.join(repoRoot, 'locales', appConfig.defaultLanguage, 'common.json'), 'utf8')) as Record<string, string>;
  for (const other of appConfig.languages.filter((lng) => lng !== appConfig.defaultLanguage)) {
    const label = names[other] ?? other;
    // Only some layouts carry a language switcher, so try every page
    const switched = await visit(session, pages, {}, async (page) => {
      const button = page.getByRole('button', { name: /change language/i }).first();
      if (!(await button.count())) return null;
      await button.click();
      await page.waitForTimeout(500);
      await page
        .getByRole('menuitem', { name: label })
        .or(page.getByRole('menuitemradio', { name: label }))
        .first()
        .click();
      await page.waitForTimeout(1200);
      return page.evaluate(() => document.documentElement.lang);
    });
    const tried = [...switched].filter((entry): entry is [string, string] => entry[1] !== null);
    for (const [id, lang] of tried) language.set(`${id} (${other})`, lang === other ? [] : [`after choosing ${label}, <html lang="${lang}">`]);
    if (!tried.length) {
      evidence.add(['3.1.1'], {
        check: 'probe:language',
        result: 'review',
        summary: `No page offers a language switcher, so ${label} was not checked.`,
        where: [],
      });
    }
  }
  evidence.addFromProblems(['3.1.1'], 'probe:language', 'The page language follows the language the user picks', language);
}
