import { faker } from '@faker-js/faker';

/** Context for mock ID generation - determines prefix behavior */
export type MockContext = 'example' | 'script' | 'loadtest';

export const scriptIdPrefix = 'gen-';
const loadtestIdPrefix = 'lt-';

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

const getIdPrefix = (): string => {
  switch (currentMockContext) {
    case 'script':
      return scriptIdPrefix;
    case 'loadtest':
      return loadtestIdPrefix;
    default:
      return '';
  }
};

export const mockNanoid = (length = 24) => {
  const prefix = getIdPrefix();
  const prefixLength = prefix.length;
  const randomPart = faker.string.alphanumeric({ length: length - prefixLength, casing: 'lower' });
  return `${prefix}${randomPart}`;
};

export const scriptUuidPrefix = '00000000';
const loadtestUuidPrefix = '00000001';

export const mockUuid = () => {
  const uuid = faker.string.uuid();
  switch (currentMockContext) {
    case 'script':
      return `${scriptUuidPrefix}${uuid.substring(scriptUuidPrefix.length)}`;
    case 'loadtest':
      return `${loadtestUuidPrefix}${uuid.substring(loadtestUuidPrefix.length)}`;
    default:
      return uuid;
  }
};

/** 6 lowercase alphanumeric characters. */
export const mockTenantId = () => mockNanoid(6);
