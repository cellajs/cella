import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { mockActorRef } from '#/schemas/entity-base-mocks';

const actorRefShape = { id: z.string(), name: z.string(), thumbnailUrl: z.string().nullable() };

/** Who wrote a row: the one shape `createdBy`, `updatedBy` and `deletedBy` carry on the wire, for both actor kinds. */
export const actorRefSchema = z
  .discriminatedUnion('kind', [
    /** A user, with the slug of their profile. */
    z.object({ ...actorRefShape, kind: z.literal('user'), slug: z.string() }),
    /** A service account, which has no profile. */
    z.object({ ...actorRefShape, kind: z.literal('service'), slug: z.null() }),
  ])
  .openapi('ActorRef', {
    description:
      'Who wrote a row: a user or a service account, with the id, kind, name and avatar a cell renders. Embedded wherever a row names its writer, as `createdBy`, `updatedBy` and `deletedBy`; null once the actor is gone.',
    example: mockActorRef(),
    'x-tags': schemaTags('embedded', 'actors', 'cella'),
  });

export const nullableActorRefSchema = z.union([actorRefSchema, z.null()]);

export type ActorRef = z.infer<typeof actorRefSchema>;
