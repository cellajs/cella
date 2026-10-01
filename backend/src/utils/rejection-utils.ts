export type RejectionState = {
  rejectedIds: string[];
  rejectionReasons: Record<string, string[]>;
};

export const createRejectionState = (): RejectionState => ({
  rejectedIds: [],
  rejectionReasons: {},
});

/** No ids leaves the state untouched: clients read the reason keys, so a reason must not appear without ids. */
const rejectMany = (rejectionState: RejectionState, ids: string[], reason: string): RejectionState => {
  if (ids.length === 0) return rejectionState;
  return {
    rejectedIds: [...rejectionState.rejectedIds, ...ids],
    rejectionReasons: {
      ...rejectionState.rejectionReasons,
      [reason]: [...(rejectionState.rejectionReasons[reason] ?? []), ...ids],
    },
  };
};

export const filterWithRejection = <T extends { id: string }>(
  items: T[],
  predicate: (item: T) => boolean,
  reason: string,
  rejectionState: RejectionState = createRejectionState(),
): { items: T[]; rejectionState: RejectionState } => {
  const passed: T[] = [];
  const rejectedIds: string[] = [];
  for (const item of items) {
    if (predicate(item)) passed.push(item);
    else rejectedIds.push(item.id);
  }

  return { items: passed, rejectionState: rejectMany(rejectionState, rejectedIds, reason) };
};

export const takeWithRestriction = <T extends { id: string }>(
  items: T[],
  restriction: number,
  reason: string,
  rejectionState: RejectionState = createRejectionState(),
): { items: T[]; rejectionState: RejectionState } => {
  const excessIds = items.slice(restriction).map((item) => item.id);
  return { items: items.slice(0, restriction), rejectionState: rejectMany(rejectionState, excessIds, reason) };
};
