import { faker } from '@faker-js/faker';

/** Context for mock ID generation - determines prefix behavior */
export type MockContext = 'example' | 'script' | 'loadtest';

/** Prefix for seed script IDs - CDC worker skips these */
export const SCRIPT_ID_PREFIX = 'gen-';

/** Prefix for load-test IDs - never collides with real/seed data */
export const LOADTEST_ID_PREFIX = 'lt-';

/** Current mock context - defaults to 'example' (no prefix) */
let currentMockContext: MockContext = 'example';

/**
 * Sets the mock context for ID generation.
 * - 'example': No prefix (for OpenAPI examples)
 * - 'script': 'gen-' prefix (for seed scripts, CDC filtering)
 * - 'loadtest': 'lt-' prefix (for load-test data, never collides with real/seed data)
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

/**
 * Gets the ID prefix based on current mock context.
 * - 'example': empty string (IDs in OpenAPI docs look like real IDs)
 * - 'script': 'gen-' (CDC worker skips these)
 * - 'loadtest': 'lt-' (for load-test data)
 */
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
 * Generates a mock nanoid with context-aware prefixing.
 * Total length matches nanoid config (24 chars by default).
 * Uses faker's seeded RNG for deterministic output.
 *
 * Prefix behavior based on context set via setMockContext():
 * - 'example' (default): No prefix - for OpenAPI documentation
 * - 'script': 'gen-' prefix - for DB seeding, CDC filtering
 * - 'loadtest': 'lt-' prefix - for load-test data
 */
export const mockNanoid = (length = 24) => {
  const prefix = getIdPrefix();
  const prefixLength = prefix.length;
  const randomPart = faker.string.alphanumeric({ length: length - prefixLength, casing: 'lower' });
  return `${prefix}${randomPart}`;
};

/**
 * Generates a mock tenant ID (6 lowercase alphanumeric chars).
 */
export const mockTenantId = () => mockNanoid(6);
