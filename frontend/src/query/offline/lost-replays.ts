import { hashKey, type Mutation } from '@tanstack/react-query';
import i18n from 'i18next';
import { isRecord } from 'shared/utils/as-record';
import { toaster } from '~/modules/common/toaster/toaster';
import { isReplayed, queuedUpdateOf } from '~/query/offline/mutation-variables';

/** The scalar fields a replayed update sent that the stored row holds from a newer edit: stamped by another write, with another value. */
function lostFieldsOf(variables: unknown, data: unknown): string[] {
  const queued = isReplayed(variables) ? queuedUpdateOf(variables) : null;
  if (!queued || !isRecord(data) || !isRecord(data.stx) || !isRecord(data.stx.fieldTimestamps)) return [];
  const stored = data.stx.fieldTimestamps;
  return Object.entries(queued.fieldTimestamps)
    .filter(([field, stamp]) => field in data && stored[field] !== stamp && hashKey([data[field]]) !== hashKey([queued.ops[field]]))
    .map(([field]) => field);
}

/** Tells the person when a replayed update lost a field; the toaster shows a repeated sentence once. */
export function reportLostReplay(mutation: Mutation<unknown, unknown, unknown>, data: unknown): void {
  if (lostFieldsOf(mutation.state.variables, data).length > 0) toaster.info(i18n.t('c:offline_edits_replaced.text'));
}
