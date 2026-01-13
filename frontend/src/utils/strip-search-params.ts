/**
 * Creates a search middleware that strips specified params from the URL.
 * Useful for removing search params from other routes when navigating.
 */
export const stripParams = (...keys: string[]) => {
  return ({
    search,
    next,
  }: {
    search: Record<string, unknown>;
    next: (s: Record<string, unknown>) => Record<string, unknown>;
  }) => {
    const filtered = { ...search };
    for (const key of keys) delete filtered[key];
    return next(filtered);
  };
};
