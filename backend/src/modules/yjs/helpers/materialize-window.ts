import { AsyncLocalStorage } from 'node:async_hooks';

/** The window a materialization writes: its entity, and the server-origin log rows the relay merged into it. */
export interface YjsMaterializeWindow {
  entityId: string;
  serverRowIds: readonly number[];
}

/**
 * Set by materializeDescriptionOp around the entity's materializer, so the `<type>.updated` handler its write dispatches
 * can check the window (assertMaterializeWindow); app materializers need no change.
 */
export const yjsMaterializeScope = new AsyncLocalStorage<YjsMaterializeWindow>();
