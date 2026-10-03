import type { Page } from 'playwright';
import type { Evidence } from './ledger.ts';
import type { ScopeState } from './scope.ts';

/** What one check found on one state. Empty `problems` and no `review` means the state passes. */
export interface Finding {
  /** The state it was found on; a check may narrow it, such as `sign-in (nl)`. */
  state: string;
  criteria: string[];
  check: string;
  /** What the check asserts, as it reads in the report. */
  what: string;
  problems: string[];
  /** A note for the person who has to judge; such a finding is neither pass nor fail. */
  review?: string;
  /** Raw value for checks that compare states with each other, such as the page title. */
  value?: string;
  /** Lowest ratio a contrast check measured on this state; the evidence quotes the lowest of all states. */
  lowest?: number;
}

/** A check inspects one open page. It returns nothing where it does not apply. */
export type Check = (page: Page, state: ScopeState) => Promise<Omit<Finding, 'state'>[]>;

/** Collects evidence per criterion. */
export class EvidenceSet {
  readonly byCriterion = new Map<string, Evidence[]>();

  add(criterionIds: string[], evidence: Evidence) {
    for (const id of criterionIds) this.byCriterion.set(id, [...(this.byCriterion.get(id) ?? []), evidence]);
  }

  /** Turns findings into one evidence entry per check and criterion: failing states fail it, review notes leave it open. */
  addFindings(findings: Finding[]) {
    const groups = new Map<string, Finding[]>();
    for (const finding of findings) {
      const key = [finding.check, finding.criteria.join(','), finding.what].join('|');
      groups.set(key, [...(groups.get(key) ?? []), finding]);
    }

    for (const group of groups.values()) {
      const { criteria, check, what } = group[0];
      const failing = group.filter((finding) => finding.problems.length);
      const notes = group.filter((finding) => finding.review);
      if (failing.length) {
        const detail = failing.map((finding) => `${finding.state}: ${finding.problems.slice(0, 3).join('; ')}`).join(' | ');
        this.add(criteria, {
          check,
          result: 'fail',
          summary: `${what} failed on ${failing.length} of ${group.length} states. ${detail}`,
          where: failing.map((finding) => finding.state),
        });
      } else if (notes.length) {
        const sample = notes
          .slice(0, 3)
          .map((finding) => `${finding.state}: ${finding.review}`)
          .join(' | ');
        this.add(criteria, { check, result: 'review', summary: `${what} ${sample}`, where: notes.map((finding) => finding.state) });
      } else {
        const ratios = group.flatMap((finding) => (finding.lowest === undefined ? [] : [finding.lowest]));
        const lowest = ratios.length ? ` The lowest measured is ${Math.min(...ratios)}:1.` : '';
        this.add(criteria, { check, result: 'pass', summary: `${what} passed on all ${group.length} states.${lowest}`, where: [] });
      }
    }
  }
}
