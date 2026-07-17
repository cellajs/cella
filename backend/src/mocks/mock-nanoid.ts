import { faker } from '@faker-js/faker';

/** Context for mock ID generation - determines prefix behavior */
export type MockContext = 'example' | 'script' | 'loadtest';

export const SCRIPT_ID_PREFIX = 'gen-';
export const LOADTEST_ID_PREFIX = 'lt-';

let currentMockContext: MockContext = 'example';

/**
 * ID prefix per context:
 * - 'example': none (OpenAPI examples)
 * - 'script': 'gen-' (seed scripts, CDC filtering)
 * - 'loadtest': 'lt-' (load-test data, never collides with real/seed data)
 */
export const setMockContext = (context: MockContext) => {
  currentMockContext = context;
};

/**
 * Executes a function with a specific mock context, restoring the original context after.
 * Useful for running seed scripts or tests without permanently changing the context.
 */
export const withMockContext = <T>(context: MockContext, fn: () => T): T => {
  const previousContext = currentMockContext;
  currentMockContext = context;
  try {
    return fn();
  } finally {
    currentMockContext = previousContext;
  }
};

const getIdPrefix = (): string => {
  switch (currentMockContext) {
    case 'script':
      return SCRIPT_ID_PREFIX;
    case 'loadtest':
      return LOADTEST_ID_PREFIX;
    default:
      return '';
  }
};

/**
 * Mock nanoid with context-aware prefixing.
 */
export const mockNanoid = (length = 24) => {
  const prefix = getIdPrefix();
  const prefixLength = prefix.length;
  const randomPart = faker.string.alphanumeric({ length: length - prefixLength, casing: 'lower' });
  return `${prefix}${randomPart}`;
};

export const SCRIPT_UUID_PREFIX = '00000000';
export const LOADTEST_UUID_PREFIX = '00000001';

/**
 * Mock UUID entity ID with context-aware prefixing.
 */
export const mockUuid = () => {
  const uuid = faker.string.uuid();
  switch (currentMockContext) {
    case 'script':
      return `${SCRIPT_UUID_PREFIX}${uuid.substring(SCRIPT_UUID_PREFIX.length)}`;
    case 'loadtest':
      return `${LOADTEST_UUID_PREFIX}${uuid.substring(LOADTEST_UUID_PREFIX.length)}`;
    default:
      return uuid;
  }
};

/**
 * Generates a mock tenant ID (6 lowercase alphanumeric chars).
 */
export const mockTenantId = () => mockNanoid(6);
