import { onModuleRegister } from 'shared/module-registry';

/** Category (OpenAPI 3.2.0): `module`=sidebar group, `owner`/`entity`=annotation, `schema`=schema bucket, `hidden`=drop from docs. */
export type OpenApiTagKind = 'module' | 'owner' | 'schema' | 'entity' | 'hidden';

/** Tag definition for OpenAPI documentation (forward-compatible with OpenAPI 3.2.0). */
interface OpenApiTag {
  tag: string;
  description: string;
  /** Short display name (OpenAPI 3.2.0 `summary` field). */
  summary?: string;
  /** Parent tag name for hierarchical grouping (OpenAPI 3.2.0). */
  parent?: string;
  kind?: OpenApiTagKind;
  externalDocs?: { url: string; description?: string };
  /** For schema-kind tags: marks the fallback bucket when a component schema has no `x-tags`. */
  default?: boolean;
}

/** Ordered registry of OpenAPI tags. Insertion order = display order. */
const tagRegistry = new Map<string, OpenApiTag>();

/** Keeps the first registration of a name. */
const registerTag = (tag: OpenApiTag): void => {
  if (!tagRegistry.has(tag.tag)) tagRegistry.set(tag.tag, tag);
};

/** Every registered tag, in display order. */
export const getRegisteredTags = (): OpenApiTag[] => [...tagRegistry.values()];

/** Default owner tags, registered eagerly so module tags can reference them as parents. */
registerTag({ tag: 'cella', kind: 'owner', description: 'Core modules provided by the template.' });

registerTag({ tag: 'app', kind: 'owner', description: 'Application-specific modules.' });

/**
 * The schema buckets of the docs schemas page, which a component joins through `x-tags`: returned whole (`data`), inside
 * other shapes (`embedded`), a stream frame (`stream`), an error body (`errors`). An untagged component joins `data`.
 */
const schemaKinds = ['data', 'embedded', 'stream', 'errors'] as const;

export type SchemaKind = (typeof schemaKinds)[number];

const schemaKindDescriptions: Record<SchemaKind, string> = {
  data: 'Shapes an operation returns whole: each entity as the API returns it, and the shapes several operations share. A shape one operation alone returns is documented on that operation, unless it is a concept of its own, such as the signed-in user.',
  embedded:
    'Shapes that appear only inside other shapes, in a response or a request: a writer reference, a user or a channel as another entity carries it, a membership, and the sync envelope of a write. An embedded schema holds the fields every embedding shows; the entity in full is under data.',
  stream:
    'The frames of the stream: a change of product rows, a signal that something else changed, and the error that ends the stream. The stream operation sends one of them per event.',
  errors: 'The error body every operation answers with, and the form it takes per status.',
};
for (const kind of schemaKinds) registerTag({ tag: kind, kind: 'schema', default: kind === 'data', description: schemaKindDescriptions[kind] });

// Entity-kind tags declare an operation's entity scope: a route adds `'channel'` or `'product'` to its `tags`.
registerTag({ tag: 'channel', kind: 'entity', description: 'Operations on channel entities: the entities that have memberships.' });

registerTag({ tag: 'product', kind: 'entity', description: 'Operations on product entities: the content entities, which have no memberships.' });

// Per-operation hide: a route adds `'internal'` to its `tags` to drop from docs while staying in the SDK.
registerTag({ tag: 'internal', kind: 'hidden', description: 'Operations hidden from the public API reference.' });

// Bridge module registry to tag registry; a `hidden` module becomes a hidden-kind tag. Last in the file: the bridge
// replays modules registered before this file loaded, which reach `registerTag` and must find it initialized.
// A module description wraps across source lines; the spec gets it as one line.
onModuleRegister(({ name, owner, description, scope, hidden }) => {
  if (scope.includes('backend')) {
    registerTag({ tag: name, kind: hidden ? 'hidden' : 'module', parent: owner, description: description.replace(/\s+/g, ' ') });
  }
});
