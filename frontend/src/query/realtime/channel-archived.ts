import type { StreamSignal } from 'sdk';
import { invalidateChannelsInside } from '~/query/realtime/membership-ops';

/**
 * A channel the user reads was archived or unarchived, by anyone, from any tab. An archive can take the channels inside
 * it along, and the menu, the channel's page and `useCan` read the flag from their rows.
 */
export function handleChannelArchived({ subjectId }: StreamSignal): void {
  if (subjectId) invalidateChannelsInside(subjectId);
}
