import { faker } from '@faker-js/faker';

/** Global scale factor for seeded channel/product volume. Bump it (5, 10, ...) and reseed to stress-test; base counts in the seed scripts stay the everyday default. */
export const SEED_MULTIPLIER = 1;

/** Varies a base count per call: 50% to 200% of `base * SEED_MULTIPLIER`, never below `floor` (for counts where index-based semantics matter). */
export const vary = (base: number, floor = 1) =>
  Math.max(floor, Math.round(faker.number.float({ min: 0.5, max: 2 }) * base * SEED_MULTIPLIER));

/** Splits rows into insert batches to stay clear of the Postgres bind-parameter limit. */
export const toBatches = <T>(rows: T[], size = 500): T[][] => {
  const batches: T[][] = [];
  for (let i = 0; i < rows.length; i += size) batches.push(rows.slice(i, i + size));
  return batches;
};
