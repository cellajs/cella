import type { ChannelEntityType, EntityRole } from '../types.ts';
import type { ChannelSlot } from './placements.ts';

/**
 * A membership role qualified by the channel type holding it. Used in a tool's `visibleTo` as a
 * UI visibility condition, never data authorization. A pair matches when the actor holds the role
 * on the hosting entity or an ancestor, and pairs are validated against the hierarchy at
 * registration.
 */
export type ContextRole = `${ChannelEntityType}.${EntityRole}`;

/** Per-slot arrangement a channel stores: tool ids only, never labels, renderers, or secrets. */
export interface SlotToolsConfig {
  /** Tool ids in display sequence; registered tools not listed append at their default order. */
  order?: string[];
  /** Tool ids hidden on this channel (`locked` tools are immune). */
  hidden?: string[];
}

/**
 * Channel-persisted tool arrangement, keyed by one of that channel's own slots. Stored sparse on the channel row
 * (`toolsConfig` jsonb): a missing slot key means the slot renders what the app's `surfaces` config
 * and the module manifests give it. Unknown tool ids reconcile fail-closed: they are dropped, never
 * widened, and an unknown slot key is refused at the wire.
 */
export type ToolsConfig = Partial<Record<ChannelSlot, SlotToolsConfig>>;
