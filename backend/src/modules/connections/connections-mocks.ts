import { mockTenantId, mockTimestamps, mockUuid, withFakerSeed } from '#/mocks';
import { mockActorRef } from '#/schemas/entity-base-mocks';

export const mockConnectionResponse = (key = 'connection:default') =>
  withFakerSeed(key, () => ({
    id: mockUuid(),
    tenantId: mockTenantId(),
    kind: 'sso' as const,
    federation: 'surfconext',
    issuer: null,
    clientId: null,
    claimValues: ['uu.nl'],
    name: 'Utrecht University',
    status: 'active' as const,
    jitProvisioning: true,
    config: { idpEntityIds: ['https://login.uu.nl/nidp/saml2/metadata'] },
    createdBy: mockActorRef(`${key}:created-by`),
    updatedBy: null,
    ...mockTimestamps(),
  }));

export const mockLtiConnectionResponse = (key = 'connection:lti') =>
  withFakerSeed(key, () => ({
    id: mockUuid(),
    tenantId: mockTenantId(),
    kind: 'lti' as const,
    federation: null,
    issuer: 'https://lms.example.com',
    clientId: '10000000000123',
    claimValues: [],
    name: 'lms.example.com',
    status: 'active' as const,
    jitProvisioning: false,
    config: {
      authorizationEndpoint: 'https://lms.example.com/lti/authorize',
      tokenEndpoint: 'https://lms.example.com/oauth/token',
      authorizationServer: 'https://lms.example.com',
      jwksUri: 'https://lms.example.com/oauth/jwks',
      productFamilyCode: 'moodle',
      version: '4.5',
      deploymentIds: ['deployment-1'],
    },
    createdBy: mockActorRef(`${key}:created-by`),
    updatedBy: null,
    ...mockTimestamps(),
  }));
