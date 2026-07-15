import { onModuleRegister } from 'shared/module-registry';

// Bridge shared module registry to OpenAPI tag registry
onModuleRegister(({ name, owner, description, scope }) => {
  if (scope.includes('backend')) {
    registerTag({ tag: name, kind: 'module', parent: owner, description });
  }
});

/** Tag definition for OpenAPI documentation (forward-compatible with OpenAPI 3.2.0). */
export interface OpenApiTag {
  tag: string;
  description: string;
  /** Short display name (OpenAPI 3.2.0 `summary` field). */
  summary?: string;
  /** Parent tag name for hierarchical grouping (OpenAPI 3.2.0). */
  parent?: string;
  /** Machine-readable category (OpenAPI 3.2.0). */
  kind?: 'module' | 'owner' | 'schema' | 'entity';
  /** Link to external documentation. */
  externalDocs?: { url: string; description?: string };
  /** For schema-kind tags: marks the fallback bucket when a component schema has no `x-tags`. */
  default?: boolean;
}

/** Ordered registry of OpenAPI tags. Insertion order = display order. */
const tagRegistry = new Map<string, OpenApiTag>();

/** Register a tag for OpenAPI documentation, skipping entries that are already registered. */
export const registerTag = (tag: OpenApiTag): OpenApiTag => {
  if (!tagRegistry.has(tag.tag)) tagRegistry.set(tag.tag, tag);
  return tag;
};

/** Returns all registered tags in registration (display) order. */
export const getRegisteredTags = (): OpenApiTag[] => [...tagRegistry.values()];

/** Default owner tags, registered eagerly so module tags can reference them as parents. */
registerTag({
  tag: 'cella',
  kind: 'owner',
  description: 'Core modules provided by cella.',
});

registerTag({
  tag: 'app',
  kind: 'owner',
  description: 'Application-specific modules.',
});

/**
 * Default schema-kind tags: buckets for grouping OpenAPI component schemas
 * in the docs UI. Schemas declare membership via an `x-tags` extension on the
 * component schema itself; schemas without a matching tag fall back to the
 * tag flagged with `default: true`.
 */
registerTag({
  tag: 'data',
  kind: 'schema',
  default: true,
  description: 'Complete data schemas',
});

registerTag({
  tag: 'base',
  kind: 'schema',
  description: 'Schemas with base fields only',
});

registerTag({
  tag: 'errors',
  kind: 'schema',
  description: 'Error schemas',
});

/**
 * Default entity-kind tags declare an operation's entity scope. Routes opt in
 * by adding `'channel'` or `'product'` to their `tags` array, the same way they
 * declare ownership (`'cella'` / `'app'`).
 */
registerTag({
  tag: 'channel',
  kind: 'entity',
  description: 'Operations on channel entities (entities that have memberships, e.g. organizations, projects).',
});

registerTag({
  tag: 'product',
  kind: 'entity',
  description: 'Operations on product entities (content entities without membership, e.g. tasks, pages, attachments).',
});
