import { faker } from '@faker-js/faker';

const stringToSeed = (key: string): number => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
};

/** The same `key` always produces the same fake data, for OpenAPI examples and reproducible tests. */
export const withFakerSeed = <T>(key: string, generator: () => T): T => {
  faker.seed(stringToSeed(key));
  const result = generator();
  // A bare `faker.seed()` draws one of 2^32 seeds: the id drawn next then repeats within some hundred thousand rows of a seed run.
  faker.seed([...crypto.getRandomValues(new Uint32Array(8))]);
  return result;
};
