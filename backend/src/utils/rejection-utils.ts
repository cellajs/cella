/**
 * Pure function utilities for tracking rejected items in batch operations.
 * Provides immutable, composable functions for building rejection state.
 */

/** Rejection state passed through the pipeline */
export type RejectionState = {
  rejectedItemIds: string[];
  rejectionReasons: Record<string, string[]>;
};

/** Create empty rejection state */
export const createRejectionState = (): RejectionState => ({
  rejectedItemIds: [],
  rejectionReasons: {},
});

/** Add a single rejection (immutable) */
export const reject = (rejectionState: RejectionState, id: string, reason: string): RejectionState => ({
  rejectedItemIds: [...rejectionState.rejectedItemIds, id],
  rejectionReasons: {
    ...rejectionState.rejectionReasons,
    [reason]: [...(rejectionState.rejectionReasons[reason] ?? []), id],
  },
});

/** Add multiple rejections with same reason (immutable) */
export const rejectMany = (rejectionState: RejectionState, ids: string[], reason: string): RejectionState => ({
  rejectedItemIds: [...rejectionState.rejectedItemIds, ...ids],
  rejectionReasons: {
    ...rejectionState.rejectionReasons,
    [reason]: [...(rejectionState.rejectionReasons[reason] ?? []), ...ids],
  },
});

/** Merge two rejection states */
export const mergeRejections = (a: RejectionState, b: RejectionState): RejectionState => {
  const merged = { ...a.rejectionReasons };
  for (const [reason, ids] of Object.entries(b.rejectionReasons)) {
    merged[reason] = [...(merged[reason] ?? []), ...ids];
  }
  return {
    rejectedItemIds: [...a.rejectedItemIds, ...b.rejectedItemIds],
    rejectionReasons: merged,
  };
};

/** Filter items, rejecting those that fail the predicate */
export const filterWithRejection = <T extends { id: string }>(
  items: T[],
  predicate: (item: T) => boolean,
  reason: string,
  rejectionState: RejectionState = createRejectionState(),
): { items: T[]; rejectionState: RejectionState } => {
  const passed: T[] = [];
  let newState = rejectionState;

  for (const item of items) {
    if (predicate(item)) passed.push(item);
    else newState = reject(newState, item.id, reason);
  }

  return { items: passed, rejectionState: newState };
};

/** Take up to restriction count of items, reject the rest */
export const takeWithRestriction = <T extends { id: string }>(
  items: T[],
  restriction: number,
  reason: string,
  rejectionState: RejectionState = createRejectionState(),
): { items: T[]; rejectionState: RejectionState } => {
  const taken = items.slice(0, restriction);
  const excess = items.slice(restriction);
  const excessIds = excess.map((item) => item.id);

  return {
    items: taken,
    rejectionState: rejectMany(rejectionState, excessIds, reason),
  };
};
