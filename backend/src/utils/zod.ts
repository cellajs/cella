import * as z from 'zod';

function isValidZodLiteralUnion<T extends z.ZodLiteral<unknown>>(literals: T[]): literals is [T, T, ...T[]] {
  return literals.length >= 2;
}

export function constructZodLiteralUnionType<T extends z.ZodLiteral<unknown>>(literals: T[]) {
  if (!isValidZodLiteralUnion(literals)) {
    throw new Error('Literals passed do not meet the criteria for constructing a union schema, the minimum length is 2');
  }

  return z.union(literals);
}

export function numberEnum<T extends number>(values: readonly T[]) {
  const set = new Set<unknown>(values);
  return (v: number, ctx: z.RefinementCtx): v is T => {
    if (!set.has(v)) {
      ctx.addIssue({
        code: z.ZodIssueCode.invalid_enum_value,
        received: v,
        options: [...values],
      });
    }
    return z.NEVER;
  };
}
