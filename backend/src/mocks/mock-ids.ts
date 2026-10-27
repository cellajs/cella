import { faker } from '@faker-js/faker';

/** What mock ids are drawn for: OpenAPI examples, seed scripts or load-test data. */
type MockContext = 'example' | 'script' | 'loadtest';

export const scriptIdPrefix = 'gen-';
export const scriptUuidPrefix = '00000000';

let currentMockContext: MockContext = 'example';

/** Sets the context every later mock id is prefixed for (`idPrefixes`, `uuidPrefixes`). */
export const setMockContext = (context: MockContext) => {
  currentMockContext = context;
};

/** Restores the previous context afterwards. */
export const withMockContext = <T>(context: MockContext, fn: () => T): T => {
  const previousContext = currentMockContext;
  currentMockContext = context;
  try {
    return fn();
  } finally {
    currentMockContext = previousContext;
  }
};

/** Examples carry no prefix; seeded and load-test rows carry their own, so load-test data never collides with real or seed data. */
const idPrefixes: Record<MockContext, string> = { example: '', script: scriptIdPrefix, loadtest: 'lt-' };
const uuidPrefixes: Record<MockContext, string> = { example: '', script: scriptUuidPrefix, loadtest: '00000001' };

/** A lowercase alphanumeric id of `length` characters, the context's prefix included. */
export const mockNanoid = (length = 24) => {
  const prefix = idPrefixes[currentMockContext];
  return `${prefix}${faker.string.alphanumeric({ length: length - prefix.length, casing: 'lower' })}`;
};

/** A uuid whose first characters are the context's prefix. */
export const mockUuid = () => {
  const prefix = uuidPrefixes[currentMockContext];
  return `${prefix}${faker.string.uuid().slice(prefix.length)}`;
};

/** 6 lowercase alphanumeric characters. */
export const mockTenantId = () => mockNanoid(6);
