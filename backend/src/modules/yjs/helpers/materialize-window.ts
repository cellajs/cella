import { AsyncLocalStorage } from 'node:async_hooks';

/** The window a materialization writes: its entity, and the server-origin log rows the relay merged into it. */
interface YjsMaterializeWindow {
  entityId: string;
  serverRowIds: readonly number[];
}

/**
 * Set by materializeDescriptionOp around the entity's materializer: the `<type>.updated` handler takes the write of the
 * window's entity for the relay's and checks it (assertMaterializeWindow), and any other row written inside the window
 * for an outside write. App materializers need no change.
 */
export const yjsMaterializeWindow = new AsyncLocalStorage<YjsMaterializeWindow>();
