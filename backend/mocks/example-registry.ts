/** Registry mapping OpenAPI schema names to their example generators */
const exampleRegistry = new Map<string, () => unknown>();

/**
 * Register an example generator for a schema name.
 * Call this from mock files to self-register their response examples.
 */
export const registerExample = (schemaName: string, generator: () => unknown) => {
  exampleRegistry.set(schemaName, generator);
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

  const generator = exampleRegistry.get(schemaName);
  if (!generator) return undefined;

  // Generate and cache the example
  const example = generator();
  exampleCache.set(schemaName, example);
  return example;
};
