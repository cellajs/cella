import AxeBuilder from '@axe-core/playwright';
import type { Page } from 'playwright';
import { criterionFromAxeTag } from './criteria.ts';
import type { Evidence } from './ledger.ts';
import { devOnlySelectors } from './session.ts';

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const contrastRule = 'color-contrast';

interface AxeNode {
  target: string;
  html: string;
  summary: string;
}

interface AxeRule {
  id: string;
  help: string;
  helpUrl: string;
  /** Criteria the rule maps to; empty for a best-practice rule. */
  criteria: string[];
}

/** What axe found on one state in one color mode. */
export interface AxeScan {
  where: string;
  failed: (AxeRule & { nodes: AxeNode[] })[];
  review: AxeRule[];
  passed: AxeRule[];
  /** Selectors of the text whose contrast axe could not decide; the text-contrast probe measures them. */
  undecidedContrast: string[];
}

/**
 * Runs axe on the open page. `contrastOnly` limits it to the one rule whose result depends on the color mode, for the
 * dark-mode visit.
 */
export async function axeScan(page: Page, where: string, contrastOnly = false): Promise<AxeScan> {
  let builder = new AxeBuilder({ page });
  builder = contrastOnly ? builder.withRules([contrastRule]) : builder.withTags([...wcagTags, 'best-practice']);
  for (const selector of devOnlySelectors) builder = builder.exclude(selector);
  const result = await builder.analyze();

  const rule = ({ id, help, helpUrl, tags }: (typeof result.passes)[number]): AxeRule => ({
    id,
    help,
    helpUrl,
    criteria: tags.map(criterionFromAxeTag).filter((criterion) => criterion !== null),
  });
  return {
    where,
    failed: result.violations.map((violation) => ({
      ...rule(violation),
      nodes: violation.nodes.map((node) => ({ target: node.target.join(' '), html: node.html.slice(0, 200), summary: node.failureSummary ?? '' })),
    })),
    review: result.incomplete.map(rule),
    passed: result.passes.map(rule),
    undecidedContrast: result.incomplete.filter(({ id }) => id === contrastRule).flatMap(({ nodes }) => nodes.map((node) => node.target.join(' '))),
  };
}

/**
 * Evidence per criterion from all scans, plus the raw report for fixing: every failing element per rule and state.
 * With `contrastMeasured`, what axe could not decide about contrast is the text-contrast probe's to judge, so it
 * leaves no review note here.
 */
export function summarizeAxe(scans: AxeScan[], contrastMeasured = false) {
  const rules = new Map<string, AxeRule & { failed: Map<string, AxeNode[]>; review: string[]; passed: number }>();
  const advisories = new Map<string, { help: string; where: string[] }>();
  const tally = (rule: AxeRule) => {
    const entry = rules.get(rule.id) ?? { ...rule, failed: new Map<string, AxeNode[]>(), review: [] as string[], passed: 0 };
    rules.set(rule.id, entry);
    return entry;
  };

  for (const scan of scans) {
    for (const rule of scan.failed) {
      if (rule.criteria.length) tally(rule).failed.set(scan.where, rule.nodes);
      else advisories.set(rule.id, { help: rule.help, where: [...(advisories.get(rule.id)?.where ?? []), scan.where] });
    }
    for (const rule of scan.review) if (rule.criteria.length) tally(rule).review.push(scan.where);
    for (const rule of scan.passed) if (rule.criteria.length) tally(rule).passed += 1;
  }

  const evidence = new Map<string, Evidence[]>();
  for (const rule of rules.values()) {
    const failedWhere = [...rule.failed.keys()];
    const elements = [...rule.failed.values()].reduce((sum, nodes) => sum + nodes.length, 0);
    const item: Evidence = failedWhere.length
      ? { check: 'axe', result: 'fail', summary: `axe ${rule.id}: ${rule.help} (${elements} elements).`, where: failedWhere }
      : rule.review.length && !(contrastMeasured && rule.id === contrastRule)
        ? {
            check: 'axe',
            result: 'review',
            summary: `axe ${rule.id} needs a person to check ${rule.review.length} states: ${rule.help}.`,
            where: rule.review,
          }
        : rule.review.length
          ? {
              check: 'axe',
              result: 'pass',
              summary: `axe ${rule.id} found no failing element; what it left undecided on ${rule.review.length} visits is measured by a probe.`,
              where: [],
            }
          : { check: 'axe', result: 'pass', summary: `axe ${rule.id} passed on ${rule.passed} states.`, where: [] };
    for (const id of rule.criteria) evidence.set(id, [...(evidence.get(id) ?? []), item]);
  }

  const report = {
    rules: Object.fromEntries(
      [...rules].map(([id, rule]) => [
        id,
        { help: rule.help, helpUrl: rule.helpUrl, criteria: rule.criteria, failed: Object.fromEntries(rule.failed), review: rule.review },
      ]),
    ),
    advisories: Object.fromEntries(advisories),
  };
  return { evidence, report };
}
