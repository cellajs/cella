import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { mockSsoEntryResponse } from '#/modules/auth/auth-mocks';
import { connectionStatuses } from '#/modules/connections/connections-db';
import { validIdSchema } from '#/schemas';

export const ssoConnectionParamSchema = z.object({ connectionId: validIdSchema });

export const ssoFederationParamSchema = z.object({ federation: z.string().min(1).max(64) });

/** What a tenant's SSO entry page shows before the browser leaves for the federation. */
export const ssoEntrySchema = z
  .object({
    id: z.string(),
    status: z.enum(connectionStatuses).describe('Only `active` signs in; `pending` means the institution has not activated the app yet'),
    federation: z.object({ key: z.string(), label: z.string() }),
    institution: z.object({ displayName: z.string(), logoUrl: z.string().nullable() }),
    organization: z.object({ id: z.string(), name: z.string(), slug: z.string(), thumbnailUrl: z.string().nullable() }).nullable(),
  })
  .openapi('SsoEntry', {
    description:
      "The sign-in entry of one institution at one organization: the federation it goes through, the institution, the organization, and whether it is active. Public by the connection's id, which is the link an institution shares.",
    example: mockSsoEntryResponse(),
    'x-tags': schemaTags('data', 'auth', 'cella'),
  });
