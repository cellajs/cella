import { mockAttachmentResponse } from './mock-attachment';
import { mockMembershipResponse } from './mock-membership';
import { mockOrganizationResponse } from './mock-organization';
import { mockPageResponse } from './mock-page';
import { mockUserResponse } from './mock-user';

/** Supported schema names for example generation */
export type ExampleSchemaName = 'Organization' | 'User' | 'Attachment' | 'Page' | 'Membership';

/** Type-safe registry mapping OpenAPI schema names to their example generators */
export const exampleRegistry: Record<ExampleSchemaName, () => unknown> = {
  Organization: mockOrganizationResponse,
  User: mockUserResponse,
  Attachment: mockAttachmentResponse,
  Page: mockPageResponse,
  Membership: mockMembershipResponse,
};

/** Cache for generated examples - ensures same schema always returns same example */
const exampleCache = new Map<string, unknown>();

/**
 * Get an example for a schema by its OpenAPI name.
 * Results are cached so the same schema always returns the same example.
 * Returns undefined if no generator is registered.
 */
export const getExampleForSchema = (schemaName: string): unknown | undefined => {
  // Return cached example if available
  if (exampleCache.has(schemaName)) {
    return exampleCache.get(schemaName);
  }

  const generator = exampleRegistry[schemaName as ExampleSchemaName];
  if (!generator) return undefined;

  // Generate and cache the example
  const example = generator();
  exampleCache.set(schemaName, example);
  return example;
};
