import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { entityListItemSchema } from '#/modules/entities/schema';

export const apiModulesList = [
  {
    name: 'me',
    description: `Endpoints related to the *current user*, meaning the user associated with the active session making the request.
      These routes are distinct from general \`users\` endpoints: while \`users\` may operate on any user in the system, \`me\` endpoints are scoped exclusively to the *current user* and follow a different authorization flow.`,
  },
  {
    name: 'users',
    description: `Endpoints for managing *users* at the system level.
      Unlike contextual entities (such as \`organizations\`), a \`user\` is a "global" entity and not scoped to a specific context.
      These endpoints are intended for administrative operations on any user in the system.`,
  },
  {
    name: 'memberships',
    description: `Endpoints for managing *memberships*, which represent one-to-one relationships between a \`user\` and a contextual \`entity\` (e.g., an \`organization\`).  
      Each membership includes role information and status flags such as \`archived\` or \`muted\`.  
      Memberships can also reference parent entities, enabling hierarchical context.`,
  },
  {
    name: 'organizations',
    description: `Endpoints for managing \`organizations\`, which are core contextual entities.  
      Organizations are the highest ancestor in the parent hierarchy.  
      They define access boundaries and are often the minimal primary scope for permission and resource management.`,
  },
  {
    name: 'requests',
    description: 'Endpoints for handling incoming *requests* such as contact form submissions, newsletter signups, and waitlist entries.',
  },
  {
    name: 'entities',
    description: `Endpoints that operate across multiple *entity types*, such as \`users\` and \`organizations\`.
      *Entities* are identifiable domain objects that may be contextual, hierarchical (with parent/child relations), or actor-like.
      These endpoints offer shared logic across modules, including slug validation and entity visibility.`,
  },
  {
    name: 'system',
    description: `*System level* endpoints for administrative actions and platform wide functionality.
      These endpoints support operations such as user invitations, file uploads, and webhook handling.`,
  },
  {
    name: 'auth',
    description: `*Authentication* endpoints supporting multiple sign-in methods, including email/password, OAuth (Google, Microsoft, GitHub), and passkeys (WebAuthn).  
      These routes cover user sign-up, sign-in, password recovery, email verification, account linking, and impersonation for system admins.`,
  },
  {
    name: 'attachments',
    description: `Endpoints for managing file based *attachments* (e.g. images, PDFs, documents) linked to entities such as organizations or users.
      Files are uploaded directly by the client; the API handles metadata registration, linking, access, and preview utilities.`,
  },
  {
    name: 'metrics',
    description: `Endpoints for retrieving system level statistics and basic observability data.
      Includes internal metrics as well as simple, high level counts for entities such as \`users\` and \`organizations\`.`,
  },
];

/**
 * Allows registering app-specific OpenAPI schemas.
 * These schemas will be generated by openapi-ts on frontend
 * and included in generated OpenAPI documentation.
 */
export const registerAppSchema = (registry: OpenAPIRegistry) => {
  registry.register('EntityListItemSchema', entityListItemSchema);
};
