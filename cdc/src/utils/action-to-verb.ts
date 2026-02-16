import type { ActivityAction } from '#/sync/activity-bus';

/**
 * Convert an action to past tense verb for the activity type.
 * E.g., 'create' -> 'created', 'update' -> 'updated'
 */
export const actionToVerb = (action: ActivityAction): string => {
  const verbMap: Record<ActivityAction, string> = {
    create: 'created',
    update: 'updated',
    delete: 'deleted',
  };
  return verbMap[action];
};
