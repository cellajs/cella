import { mockTenantId, mockTimestamps, mockUuid, withFakerSeed } from '#/mocks';
import { mockActorRef } from '#/schemas/entity-base-mocks';

export const mockConnectionResponse = (key = 'connection:default') =>
  withFakerSeed(key, () => ({
    id: mockUuid(),
    tenantId: mockTenantId(),
    kind: 'sso' as const,
    issuer: 'surfconext',
    claimValues: ['uu.nl'],
    displayName: 'Utrecht University',
    status: 'active' as const,
    jitProvisioning: true,
    config: { idpEntityIds: ['https://login.uu.nl/nidp/saml2/metadata'] },
    createdBy: mockActorRef(`${key}:created-by`),
    updatedBy: null,
    ...mockTimestamps(),
  }));
