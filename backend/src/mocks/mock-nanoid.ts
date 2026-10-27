import { faker } from '@faker-js/faker';

/** Context for mock ID generation - determines prefix behavior */
export type MockContext = 'example' | 'script' | 'loadtest';

export const scriptIdPrefix = 'gen-';
export const scriptUuidPrefix = '00000000';

let currentMockContext: MockContext = 'example';

/**
 * ID prefix per context:
 * - 'example': none (OpenAPI examples)
 * - 'script': 'gen-' (seed scripts)
 * - 'loadtest': 'lt-' (load-test data, never collides with real/seed data)
 */
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

const idPrefixes: Record<MockContext, string> = { example: '', script: scriptIdPrefix, loadtest: 'lt-' };
const uuidPrefixes: Record<MockContext, string> = { example: '', script: scriptUuidPrefix, loadtest: '00000001' };

export const mockNanoid = (length = 24) => {
  const prefix = idPrefixes[currentMockContext];
  return `${prefix}${faker.string.alphanumeric({ length: length - prefix.length, casing: 'lower' })}`;
};

export const mockUuid = () => {
  const prefix = uuidPrefixes[currentMockContext];
  return `${prefix}${faker.string.uuid().slice(prefix.length)}`;
};

/** 6 lowercase alphanumeric characters. */
export const mockTenantId = () => mockNanoid(6);
