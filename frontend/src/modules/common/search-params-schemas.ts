import { zApiError } from 'sdk/zod.gen';
import { z } from 'zod';

/** Search params for the error routes: error page, auth error, account OAuth errors. */
export const errorSearchSchema = z.object({ error: z.string().optional(), severity: zApiError.shape.severity.optional() });

type SortOrder = 'asc' | 'desc';

/** A generated list query: its search, and the sort and order its request schema defaults. */
interface ListQuery<TSort extends string> {
  shape: {
    q: z.ZodOptional<z.ZodString>;
    sort: z.ZodDefault<z.ZodOptional<z.ZodType<TSort>>>;
    order: z.ZodDefault<z.ZodOptional<z.ZodType<SortOrder>>>;
  };
}

type ListSearchDefaults<TSort extends string> = { q: string; sort: TSort; order: SortOrder };

/** The search a list opens on: no search, and the sort and order the API takes when a request names none. */
export const listSearchDefaults = <TSort extends string>({ shape }: ListQuery<TSort>): ListSearchDefaults<TSort> => ({
  q: '',
  sort: shape.sort.parse(undefined),
  order: shape.order.parse(undefined),
});

/** A list route's search: an absent or unknown sort or order (an old bookmark) reads as `defaults`, the API's unless a view opens on its own. */
export const listSearchSchema = <TSort extends string>(query: ListQuery<TSort>, defaults = listSearchDefaults(query)) =>
  z.object({
    q: query.shape.q,
    sort: query.shape.sort.unwrap().default(defaults.sort).catch(defaults.sort),
    order: query.shape.order.unwrap().default(defaults.order).catch(defaults.order),
  });
