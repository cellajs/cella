import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { mockActorRef } from '#/schemas/entity-base-mocks';

const actorKinds = ['user', 'service'] as const;

/** Who wrote a row: the one shape `createdBy`, `updatedBy` and `deletedBy` carry on the wire, for both actor kinds. */
export const actorRefSchema = z
  .object({
    id: z.string(),
    kind: z.enum(actorKinds),
    name: z.string(),
    /** A user's profile slug; a service account has none. */
    slug: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
  })
  .openapi('ActorRef', {
    description:
      'Who wrote a row: a user or a service account, with the id, kind, name and avatar a cell renders. Embedded wherever a row names its writer, as `createdBy`, `updatedBy` and `deletedBy`; null once the actor is gone.',
    example: mockActorRef(),
    'x-tags': schemaTags('base', 'actors', 'cella'),
  });

export const nullableActorRefSchema = z.union([actorRefSchema, z.null()]);

export type ActorRef = z.infer<typeof actorRefSchema>;
