import { type AxeScan, axeScan } from './axe-scan.ts';
import type { Check, Finding } from './findings.ts';
import { formErrors, inputs } from './probes/forms.ts';
import { keyboardWalk } from './probes/keyboard.ts';
import { layout } from './probes/layout.ts';
import { statusMessages, tooltips } from './probes/overlays.ts';
import { languageSwitch, pageStructure } from './probes/page-structure.ts';
import { shortcutsOff } from './probes/shortcuts.ts';
import { reviewPacket } from './review-packet.ts';
import { ensureOpen, type ScopeState } from './scope.ts';
import { type Mode, newContext, openPage, resolvePath, type Session } from './session.ts';

export interface Visit {
  findings: Finding[];
  scan: AxeScan | null;
}

/**
 * Opens one state once and runs every check on that page.
 *
 * The light visit runs them in an order that keeps each check's page intact: checks that only read come first (the
 * toast check before its toast closes), then the ones that restore what they change, and last the keyboard walk, whose
 * Escape closes the state's overlay, and the language switch, which changes the stored language.
 *
 * The dark visit runs axe's contrast rule only, the one rule whose result depends on the color mode.
 */
export async function visitState(session: Session, state: ScopeState, mode: Mode, parts: { axe: boolean; probes: boolean }): Promise<Visit> {
  const context = await newContext(session, { auth: state.auth, mode });
  try {
    const page = await openPage(context, resolvePath(session, state.path));
    await state.open?.(page);
    const where = `${state.id} (${mode})`;
    if (mode === 'dark') return { findings: [], scan: await axeScan(page, where, true) };

    const findings: Finding[] = [];
    // A check that throws fails the visit: a state with findings missing must not reach the ledger
    const run = async (check: Check) => {
      const found = await check(page, state).catch((error: Error) => {
        throw new Error(`${check.name}: ${error.message}`);
      });
      for (const finding of found) findings.push({ ...finding, state: state.id });
    };

    if (parts.probes) for (const check of [statusMessages, pageStructure, inputs]) await run(check);
    const scan = parts.axe ? await axeScan(page, where) : null;
    if (parts.probes) {
      await run(reviewPacket);
      await run(layout);
      await run(tooltips);
      await ensureOpen(page, state);
      await run(formErrors);
      await run(keyboardWalk);
      await run(languageSwitch);
      await run(shortcutsOff);
    }
    return { findings, scan };
  } finally {
    await context.close();
  }
}
