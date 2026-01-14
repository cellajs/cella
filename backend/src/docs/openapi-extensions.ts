/**
 * OpenAPI Extension Registry
 *
 * Defines custom OpenAPI specification extensions used throughout the API.
 * These extensions are exposed via `info.x-extensions` in the OpenAPI spec,
 * allowing the frontend to dynamically render extension data without hardcoding.
 */

import { extensionRegistryMap } from '#/docs/extensions-config';
import type {
  ExtensionRegistryEntry,
  ExtensionType,
  ExtensionValueMetadata,
  SpecificationExtensions,
} from '#/docs/types';

export type {
  ExtensionMetadata,
  ExtensionRegistryEntry,
  ExtensionType,
  ExtensionValueMetadata,
  SpecificationExtensions,
} from '#/docs/types';

/**
 * Creates a SpecificationExtensions object by invoking the provided getter function for each extension type.
 *
 * @param getValue - Function that takes an ExtensionType and returns an array of strings.
 * @returns SpecificationExtensions object with values populated from the getter function.
 */
export function createSpecificationExtensions(getValue: (key: ExtensionType) => string[]): SpecificationExtensions {
  const keys = Object.keys(extensionRegistryMap) as ExtensionType[];
  return Object.fromEntries(keys.map((key) => [key, getValue(key)])) as SpecificationExtensions;
}

/**
 * Builds extension registry with values populated from the collected descriptions.
 *
 * @param valueDescriptions - Map of "extensionType:name" to description strings.
 * @returns Array of ExtensionRegistryEntry with values populated.
 */
export function buildExtensionRegistry(valueDescriptions: Map<string, string>): ExtensionRegistryEntry[] {
  return Object.entries(extensionRegistryMap).map(([key, metadata]) => {
    // Collect values for this extension type
    const values: Record<string, ExtensionValueMetadata> = {};
    for (const [mapKey, description] of valueDescriptions) {
      const [extType, name] = mapKey.split(':');
      if (extType === key && name) {
        values[name] = { description };
      }
    }

    return {
      key,
      ...metadata,
      ...(Object.keys(values).length > 0 ? { values } : {}),
    };
  });
}

/** Extension registry as array (for frontend/OpenAPI info) - without values */
export const extensionRegistry = Object.entries(extensionRegistryMap).map(([key, metadata]) => ({
  key,
  ...metadata,
}));

/** Get all registered extension keys */
export const getExtensionKeys = (): ExtensionType[] => Object.keys(extensionRegistryMap) as ExtensionType[];
