import AxeBuilder from '@axe-core/playwright';
import { criterionFromAxeTag } from './criteria.ts';
import type { Evidence } from './ledger.ts';
import type { ScopeState } from './scope.ts';
import { devOnlySelectors, type Mode, newContext, openPage, resolvePath, type Session } from './session.ts';

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

interface RuleTally {
  help: string;
  helpUrl: string;
  criteria: string[];
  failed: Map<string, { target: string; html: string; summary: string }[]>;
  review: Set<string>;
  passed: Set<string>;
}

/** Raw findings for fixing: every failing element per rule and state. */
interface AxeReport {
  rules: Record<
    string,
    {
      help: string;
      helpUrl: string;
      criteria: string[];
      failed: Record<string, { target: string; html: string; summary: string }[]>;
      review: string[];
    }
  >;
  advisories: Record<string, { help: string; where: string[] }>;
  errors: Record<string, string>;
}

/** Runs axe on every scope state in both color modes. */
export async function runAxe(session: Session, states: ScopeState[], log: (line: string) => void) {
  const rules = new Map<string, RuleTally>();
  const advisories = new Map<string, { help: string; where: Set<string> }>();
  const errors: Record<string, string> = {};

  for (const mode of ['light', 'dark'] as Mode[]) {
    for (const state of states) {
      const where = `${state.id} (${mode})`;
      const context = await newContext(session, { auth: state.auth, mode });
      try {
        const page = await openPage(context, resolvePath(session, state.path));
        await state.open?.(page);
        let builder = new AxeBuilder({ page }).withTags([...wcagTags, 'best-practice']);
        for (const selector of devOnlySelectors) builder = builder.exclude(selector);
        const result = await builder.analyze();

        const tally = (rule: (typeof result.violations)[number]) => {
          const ids = rule.tags.map(criterionFromAxeTag).filter((id) => id !== null);
          if (!ids.length) return null;
          let entry = rules.get(rule.id);
          if (!entry) {
            entry = { help: rule.help, helpUrl: rule.helpUrl, criteria: ids, failed: new Map(), review: new Set(), passed: new Set() };
            rules.set(rule.id, entry);
          }
          return entry;
        };

        for (const rule of result.violations) {
          const entry = tally(rule);
          if (!entry) {
            const advisory = advisories.get(rule.id) ?? { help: rule.help, where: new Set() };
            advisory.where.add(where);
            advisories.set(rule.id, advisory);
            continue;
          }
          entry.failed.set(
            where,
            rule.nodes.map((node) => ({ target: node.target.join(' '), html: node.html.slice(0, 200), summary: node.failureSummary ?? '' })),
          );
        }
        for (const rule of result.incomplete) tally(rule)?.review.add(where);
        for (const rule of result.passes) tally(rule)?.passed.add(where);
        log(`axe ${where}: ${result.violations.length} rules failed`);
      } catch (error) {
        errors[where] = error instanceof Error ? error.message.split('\n')[0] : String(error);
        log(`axe ${where}: could not run (${errors[where]})`);
      } finally {
        await context.close();
      }
    }
  }

  const evidence = new Map<string, Evidence[]>();
  const add = (id: string, item: Evidence) => evidence.set(id, [...(evidence.get(id) ?? []), item]);

  for (const [ruleId, rule] of rules) {
    const failedWhere = [...rule.failed.keys()];
    const elements = [...rule.failed.values()].reduce((sum, nodes) => sum + nodes.length, 0);
    const item: Evidence = failedWhere.length
      ? { check: 'axe', result: 'fail', summary: `axe ${ruleId}: ${rule.help} (${elements} elements).`, where: failedWhere }
      : rule.review.size
        ? {
            check: 'axe',
            result: 'review',
            summary: `axe ${ruleId} needs a person to check ${rule.review.size} states: ${rule.help}.`,
            where: [...rule.review],
          }
        : { check: 'axe', result: 'pass', summary: `axe ${ruleId} passed on ${rule.passed.size} states.`, where: [] };
    for (const id of rule.criteria) add(id, item);
  }

  const report: AxeReport = {
    rules: Object.fromEntries(
      [...rules].map(([id, rule]) => [
        id,
        { help: rule.help, helpUrl: rule.helpUrl, criteria: rule.criteria, failed: Object.fromEntries(rule.failed), review: [...rule.review] },
      ]),
    ),
    advisories: Object.fromEntries([...advisories].map(([id, a]) => [id, { help: a.help, where: [...a.where] }])),
    errors,
  };
  return { evidence, report };
}
