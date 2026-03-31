import type { ActivityAction } from 'shared';

export type ActivityVerb = 'created' | 'updated' | 'deleted';

/**
 * Convert an action to past tense verb for the activity type.
 * E.g., 'create' -> 'created', 'update' -> 'updated'
 */
export const actionToVerb = (action: ActivityAction): ActivityVerb => {
  const verbMap: Record<ActivityAction, ActivityVerb> = {
    create: 'created',
    update: 'updated',
    delete: 'deleted',
  };
  return verbMap[action];
};
