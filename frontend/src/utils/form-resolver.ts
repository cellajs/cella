import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldValues, Resolver } from 'react-hook-form';
import { z } from 'zod';

/** The values with each blank text field emptied: null where its schema takes null, else an empty string. */
const emptyBlanks = <V extends FieldValues>(shape: Record<string, z.ZodType>, values: V): V => {
  let result = values;
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== 'string' || value.trim() !== '' || !shape[key]) continue;
    const empty = shape[key].safeParse(null).success ? null : '';
    if (value === empty) continue;
    if (result === values) result = { ...values };
    Object.assign(result, { [key]: empty });
  }
  return result;
};

/**
 * `zodResolver` for a form, where a blank field counts as empty: an optional one the user cleared submits null and skips
 * its length and format rules, a required one fails as required, also when it holds only spaces.
 */
export const formResolver = <Input extends FieldValues, Output, Context = unknown>(
  schema: z.ZodType<Output, Input>,
): Resolver<Input, Context, Output> => {
  const resolve = zodResolver<Input, Context, Output>(schema);
  const shape = schema instanceof z.ZodObject ? schema.shape : {};
  return (values, context, options) => resolve(emptyBlanks(shape, values), context, options);
};
