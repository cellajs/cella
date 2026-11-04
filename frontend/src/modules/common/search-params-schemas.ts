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

/** A boolean search param: `true` or `false` in the URL, absent when unset; a navigate may pass the boolean. */
export const booleanSearchParam = z
  .union([z.enum(['true', 'false']), z.boolean()])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === true || value === 'true'));

/**
 * A list in one key, comma-separated, as the API reads it through `csvQuerySchema`: `?status=started,finished`.
 * A value `item` refuses is dropped, so a stale bookmark still opens; a navigate may pass the array.
 * @public
 */
export const csvSearchParam = <T extends string>(item: z.ZodType<T>) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      const values = value === undefined ? [] : Array.isArray(value) ? value : value.split(',');
      return values.filter((entry): entry is T => item.safeParse(entry).success);
    });
