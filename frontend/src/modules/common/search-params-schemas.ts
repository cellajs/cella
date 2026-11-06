import { zApiError } from 'sdk/zod.gen';
import { z } from 'zod';

/** Search params for the error routes: error page, auth error, account OAuth errors. */
export const errorSearchSchema = z.object({ error: z.string().optional(), severity: zApiError.shape.severity.optional() });

type SortOrder = 'asc' | 'desc';

const sortOrderSchema = z.enum(['asc', 'desc']);

/** A generated list query: its search, and the `orderBy` values its request schema takes and defaults. */
interface ListQuery {
  shape: { q: z.ZodOptional<z.ZodString>; orderBy: z.ZodDefault<z.ZodOptional<z.ZodEnum>> };
}

/** The fields a list orders by: its `orderBy` values without a direction. */
type SortField<Q extends ListQuery> =
  z.output<Q['shape']['orderBy']> extends infer V ? (V extends `${infer F} ${SortOrder}` ? F : Extract<V, string>) : never;

type ListSearchDefaults<TSort extends string> = { q: string; sort: TSort; order: SortOrder };

/** The fields of a list query's `orderBy`, and the sort and order it takes when a request names none. */
function orderingOf<Q extends ListQuery>({ shape }: Q) {
  const isField = (value: unknown): value is SortField<Q> => typeof value === 'string' && !value.includes(' ');
  const sortSchema = z.enum(shape.orderBy.unwrap().unwrap().options.filter(isField));
  const [sort, order = 'asc'] = String(shape.orderBy.parse(undefined)).split(' ');
  return { sortSchema, defaults: { q: '', sort: sortSchema.parse(sort), order: sortOrderSchema.parse(order) } };
}

/** The search a list opens on: no search, and the sort and order the API takes when a request names none. */
export const listSearchDefaults = <Q extends ListQuery>(query: Q): ListSearchDefaults<SortField<Q>> => orderingOf(query).defaults;

/**
 * A list route's search: an absent or unknown sort or order (an old bookmark) reads as `defaults`, the API's unless a
 * view opens on its own. The query function sends them as one `orderBy` (`orderByParam`).
 */
export const listSearchSchema = <Q extends ListQuery>(query: Q, defaults: ListSearchDefaults<SortField<Q>> = listSearchDefaults(query)) => {
  const { sortSchema } = orderingOf(query);
  return z.object({
    q: query.shape.q,
    sort: sortSchema.default(defaults.sort).catch(defaults.sort),
    order: sortOrderSchema.default(defaults.order).catch(defaults.order),
  });
};

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
