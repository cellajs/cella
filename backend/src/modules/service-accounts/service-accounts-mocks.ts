import { faker } from '@faker-js/faker';
import { appConfig } from 'shared';
import { mockPaginated, mockPastIsoDate, mockTenantId, mockUuid, withFakerSeed } from '#/mocks';
import type { CredentialModel } from '#/modules/service-accounts/credentials-db';
import type { ServiceAccountModel } from '#/modules/service-accounts/service-accounts-db';

export const mockServiceAccountResponse = (key = 'serviceAccount:default'): ServiceAccountModel =>
  withFakerSeed(key, () => {
    const organizationId = mockUuid();
    const createdAt = mockPastIsoDate();
    return {
      id: mockUuid(),
      tenantId: mockTenantId(),
      name: `${faker.hacker.noun()} bot`,
      description: faker.hacker.phrase(),
      status: 'active',
      grants: [{ channelType: 'organization', channelId: organizationId, organizationId, role: 'member' }],
      createdBy: mockUuid(),
      createdAt,
      updatedAt: createdAt,
      lastUsedAt: null,
    };
  });

export const mockCredentialResponse = (key = 'credential:default'): CredentialModel =>
  withFakerSeed(key, () => ({
    id: mockUuid(),
    principalId: mockUuid(),
    tenantId: mockTenantId(),
    type: 'secret',
    name: 'CI deploy key',
    description: null,
    prefix: `${appConfig.slug}_sk_test_Ab3d`,
    last4: 'x9Qz',
    scopes: ['attachment:read'],
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: null,
    createdBy: mockUuid(),
    createdAt: mockPastIsoDate(),
  }));

export const mockCreatedCredentialResponse = (key = 'createdCredential:default') => ({
  ...mockCredentialResponse(key),
  secret: `${appConfig.slug}_sk_test_Ab3dEfGhIjKlMnOpQrStUvWxYz012345x9Qz1A2b3C`,
});

export const mockPaginatedServiceAccountsResponse = (count = 2) => mockPaginated(mockServiceAccountResponse, count);
