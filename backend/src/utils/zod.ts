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
