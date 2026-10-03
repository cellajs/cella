import type { BrowserContextOptions } from 'playwright';
import { scope } from './scope.ts';
import { type Mode, newContext, openPage, resolvePath, type Session } from './session.ts';

/**
 * Opens a scope state by id in a fresh context and returns its page: the starting point of a short script that checks a
 * fix in the running app. `context` overrides the audit's browser settings, such as `{ reducedMotion: 'no-preference' }`,
 * a phone (`{ viewport: { width: 375, height: 800 }, hasTouch: true, isMobile: true }`) or a zoomed desktop.
 */
export async function openState(session: Session, id: string, options: { mode?: Mode; context?: BrowserContextOptions } = {}) {
  const state = scope.find((candidate) => candidate.id === id);
  if (!state) throw new Error(`No state "${id}" in a11y/scope-config.ts.`);
  const context = await newContext(session, { auth: state.auth, mode: options.mode ?? 'light' }, options.context);
  const page = await openPage(context, resolvePath(session, state.path));
  await state.open?.(page);
  return { page, context };
}
