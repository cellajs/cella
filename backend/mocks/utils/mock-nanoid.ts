import { faker } from '@faker-js/faker';

/**
 * Generates an ID matching nanoid config (lowercase alphanumeric, 24 chars).
 * Uses faker's seeded RNG for deterministic output.
 */
export const mockNanoid = (length = 24) => faker.string.alphanumeric({ length, casing: 'lower' });
