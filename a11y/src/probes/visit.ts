import type { Page } from 'playwright';
import type { Evidence } from '../ledger.ts';
import type { ScopeState } from '../scope.ts';
import { type Mode, newContext, openPage, resolvePath, type Session } from '../session.ts';

export interface VisitOptions {
  mode?: Mode;
  viewport?: { width: number; height: number };
  locale?: string;
}

/** Opens each state in a fresh context and hands the page to `inspect`; states that fail to load are skipped and reported. */
export async function visit<T>(
  session: Session,
  states: ScopeState[],
  options: VisitOptions,
  inspect: (page: Page, state: ScopeState) => Promise<T>,
): Promise<Map<string, T>> {
  const results = new Map<string, T>();
  for (const state of states) {
    const context = await newContext(session, {
      auth: state.auth,
      mode: options.mode ?? 'light',
      viewport: options.viewport,
      locale: options.locale,
    });
    try {
      const page = await openPage(context, resolvePath(session, state.path));
      await state.open?.(page);
      results.set(state.id, await inspect(page, state));
    } catch (error) {
      console.warn(`  skipped ${state.id}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    } finally {
      await context.close();
    }
  }
  return results;
}

/** Collects evidence per criterion. */
export class EvidenceSet {
  readonly byCriterion = new Map<string, Evidence[]>();

  add(criterionIds: string[], evidence: Evidence) {
    for (const id of criterionIds) this.byCriterion.set(id, [...(this.byCriterion.get(id) ?? []), evidence]);
  }

  /** Adds one pass or fail entry from per-state problems: states with problems fail, the rest pass. */
  addFromProblems(criterionIds: string[], check: string, what: string, problems: Map<string, string[]>) {
    const failing = [...problems].filter(([, list]) => list.length);
    if (failing.length) {
      const detail = failing.map(([state, list]) => `${state}: ${list.slice(0, 3).join('; ')}`).join(' | ');
      this.add(criterionIds, {
        check,
        result: 'fail',
        summary: `${what} failed on ${failing.length} of ${problems.size} states. ${detail}`,
        where: failing.map(([s]) => s),
      });
    } else {
      this.add(criterionIds, { check, result: 'pass', summary: `${what} passed on all ${problems.size} states.`, where: [] });
    }
  }
}
