/**
 * Search middleware that drops the named params of another route, such as a sibling docs page's tag: TanStack's
 * `stripSearchParams` strips only the route's own optional params.
 */
export const stripForeignParams = (...keys: string[]) => {
  return ({ search, next }: { search: Record<string, unknown>; next: (search: Record<string, unknown>) => Record<string, unknown> }) => {
    const filtered = { ...search };
    for (const key of keys) delete filtered[key];
    return next(filtered);
  };
};
