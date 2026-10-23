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

/** The seeded generators now running, outermost first, each with the number of nested calls it has made. */
const running: { key: string; nestedCalls: number }[] = [];

/** The same `key` always produces the same fake data, for OpenAPI examples and reproducible tests. Calls may nest. */
export const withFakerSeed = <T>(key: string, generator: () => T): T => {
  running.push({ key, nestedCalls: 0 });
  faker.seed(stringToSeed(key));
  try {
    return generator();
  } finally {
    running.pop();
    const outer = running.at(-1);
    if (outer) {
      // The outer generator draws on after this call, so it continues from a seed of its own key, not a random one.
      outer.nestedCalls++;
      faker.seed(stringToSeed(`${outer.key}#${outer.nestedCalls}`));
    } else {
      // A bare `faker.seed()` draws one of 2^32 seeds: the id drawn next then repeats within some hundred thousand rows of a seed run.
      faker.seed([...crypto.getRandomValues(new Uint32Array(8))]);
    }
  }
};
