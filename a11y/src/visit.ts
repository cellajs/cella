import type { Page } from 'playwright';
import { type AxeScan, axeScan } from './axe-scan.ts';
import type { Check, Finding } from './findings.ts';
import { controlContrast, textContrast } from './probes/contrast.ts';
import { formErrors, inputs } from './probes/forms.ts';
import { keyboardWalk } from './probes/keyboard.ts';
import { layout } from './probes/layout.ts';
import { statusMessages, tooltips } from './probes/overlays.ts';
import { languageSwitch, pageStructure } from './probes/page-structure.ts';
import { shortcutsOff } from './probes/shortcuts.ts';
import { removePacketFile, reviewPacket, writePacketFile } from './review-packet.ts';
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
 * The dark visit runs what depends on the color mode: axe's contrast rule and the two contrast probes.
 *
 * A step that throws fails the visit, so a state with findings missing never reaches the ledger. The visit then leaves
 * `failure-<mode>.png` and `failure-<mode>.json` in the state's review packet: what the page showed, its console
 * errors, and the steps that ran on it before, since a failing step often meets what an earlier one left behind.
 */
export async function visitState(session: Session, state: ScopeState, mode: Mode, parts: { axe: boolean; probes: boolean }): Promise<Visit> {
  const context = await newContext(session, { auth: state.auth, mode });
  const consoleErrors: string[] = [];
  context.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  context.on('weberror', (webError) => consoleErrors.push(webError.error().message));

  const record = `failure-${mode}`;
  for (const extension of ['png', 'json']) removePacketFile(state.id, `${record}.${extension}`);

  /** Steps that finished on this page, in order. */
  const done: string[] = [];
  let step = 'open';
  let page: Page | undefined;
  try {
    page = await openPage(context, resolvePath(session, state.path));
    await state.open?.(page);
    done.push(step);
    const opened = page;
    const where = `${state.id} (${mode})`;

    const findings: Finding[] = [];
    // `name` for a check built by a call, which has no name of its own
    const run = async (check: Check, name = check.name) => {
      step = name;
      for (const finding of await check(opened, state)) findings.push({ ...finding, state: mode === 'dark' ? where : state.id });
      done.push(step);
    };
    const scanPage = async (contrastOnly?: boolean) => {
      step = 'axe';
      const scan = await axeScan(opened, where, contrastOnly);
      done.push(step);
      return scan;
    };

    if (mode === 'dark') {
      const scan = await scanPage(true);
      if (parts.probes) {
        await run(textContrast(scan.undecidedContrast), 'textContrast');
        await run(controlContrast);
      }
      return { findings, scan };
    }

    if (parts.probes) for (const check of [statusMessages, pageStructure, inputs]) await run(check);
    const scan = parts.axe ? await scanPage() : null;
    if (parts.probes) {
      if (scan) await run(textContrast(scan.undecidedContrast), 'textContrast');
      await run(controlContrast);
      await run(reviewPacket);
      await run(layout);
      await run(tooltips);
      step = 'reopen';
      await ensureOpen(opened, state);
      await run(formErrors);
      await run(keyboardWalk);
      await run(languageSwitch);
      await run(shortcutsOff);
    }
    return { findings, scan };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The page may be gone, as after a crash; the record is worth having without its picture
    const screenshot = await page?.screenshot({ fullPage: true, animations: 'disabled', timeout: 5000 }).catch(() => null);
    if (screenshot) writePacketFile(state.id, `${record}.png`, screenshot);
    const failure = { step, error: message, after: done, url: page?.url() ?? null, consoleErrors };
    writePacketFile(state.id, `${record}.json`, `${JSON.stringify(failure, null, 2)}\n`);

    const previous = done.at(-1);
    const hint = `${previous ? `after ${previous}; ` : ''}see a11y/results/review/${state.id}/${record}.json`;
    throw new Error(`${step}: ${message.split('\n')[0]} (${hint})`);
  } finally {
    await context.close();
  }
}
