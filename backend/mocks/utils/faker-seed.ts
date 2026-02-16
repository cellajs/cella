import { faker } from '@faker-js/faker';
import { appConfig, type ContextEntityType } from 'config';
import { relatableContextEntityTables } from '#/relatable-config';

/**
 * Generates an ID matching nanoid config (lowercase alphanumeric, 24 chars).
 * Uses faker's seeded RNG for deterministic output.
 */
export const mockNanoid = (length = 24) => faker.string.alphanumeric({ length, casing: 'lower' });

/**
 * Converts a string key to a numeric seed for faker.
 * Uses a simple hash function for consistent results.
 */
const stringToSeed = (key: string): number => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
};

/**
 * Runs a generator function with a deterministic faker seed.
 * The same key will always produce the same fake data.
 * Useful for OpenAPI examples and reproducible tests.
 *
 * @param key - A unique string key to seed the random generator.
 * @param generator - Function that generates fake data using faker.
 * @returns The result of the generator function.
 */
export const withFakerSeed = <T>(key: string, generator: () => T): T => {
  faker.seed(stringToSeed(key));
  const result = generator();
  faker.seed(); // Reset to random seed
  return result;
};
