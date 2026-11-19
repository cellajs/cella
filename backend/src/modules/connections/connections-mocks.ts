import { mockTenantId, mockTimestamps, mockUuid, withFakerSeed } from '#/mocks';
import { mockActorRef, mockChannelBase } from '#/schemas/entity-base-mocks';

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
    issuer: 'https://canvas.instructure.com',
    clientId: '10000000000123',
    claimValues: [],
    name: 'canvas.instructure.com',
    status: 'active' as const,
    jitProvisioning: true,
    config: {
      authorizationEndpoint: 'https://sso.canvaslms.com/api/lti/authorize_redirect',
      tokenEndpoint: 'https://sso.canvaslms.com/login/oauth2/token',
      authorizationServer: 'https://sso.canvaslms.com/login/oauth2/token',
      jwksUri: 'https://sso.canvaslms.com/api/lti/security/jwks',
      productFamilyCode: 'canvas',
      version: 'cloud',
      deploymentIds: ['123:8865aa05b4b79b64a91a86042e43af5ea8ae79eb'],
    },
    createdBy: mockActorRef(`${key}:created-by`),
    updatedBy: null,
    ...mockTimestamps(),
  }));

/** A course of an LTI connection whose last member import read everyone. */
export const mockLtiContextResponse = (key = 'ltiContext:default') =>
  withFakerSeed(key, () => {
    const { createdAt, updatedAt } = mockTimestamps();
    return {
      id: mockUuid(),
      connectionId: mockUuid(),
      contextId: 'biology-101',
      label: 'BIO-101',
      title: 'Introduction to biology',
      channel: mockChannelBase(`${key}:channel`),
      apiUrl: 'https://lms.example.com/api/tenants/example-tenant',
      importRanAt: updatedAt,
      importReadCount: 42,
      importIssue: null,
      createdAt,
    };
  });
