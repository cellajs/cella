import { onModuleRegister } from 'shared/module-registry';

// Bridge module registry to tag registry; a `hidden` module becomes a hidden-kind tag.
onModuleRegister(({ name, owner, description, scope, hidden }) => {
  if (scope.includes('backend')) {
    registerTag({ tag: name, kind: hidden ? 'hidden' : 'module', parent: owner, description });
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
  /** Category (OpenAPI 3.2.0): `module`=sidebar group, `owner`/`entity`=annotation, `schema`=schema bucket, `hidden`=drop from docs. */
  kind?: 'module' | 'owner' | 'schema' | 'entity' | 'hidden';
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

// Schema tags group OpenAPI components in the docs UI. Components opt in through
// `x-tags`; unmatched schemas use the tag marked as the default.
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

// Per-operation hide: a route adds `'internal'` to its `tags` to drop from docs while staying in the SDK.
registerTag({
  tag: 'internal',
  kind: 'hidden',
  description: 'Operations hidden from the public API reference.',
});
