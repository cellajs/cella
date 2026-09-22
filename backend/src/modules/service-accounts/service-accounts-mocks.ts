import { faker } from '@faker-js/faker';
import { appConfig } from 'shared';
import { mockPaginated, mockPastIsoDate, mockTenantId, mockUuid, withFakerSeed } from '#/mocks';
import type { CredentialModel } from '#/modules/service-accounts/credentials-db';
import { checksumOf } from '#/modules/service-accounts/helpers/api-key';
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
      clientId: null,
      createdBy: mockUuid(),
      createdAt,
      updatedAt: createdAt,
      updatedBy: null,
      lastUsedAt: null,
    };
  });

/** A fixed key whose checksum is computed, so the example round-trips through `parseApiKey`; never issued. */
const exampleBody = `${appConfig.slug}_sk_test_Ab3dEfGhIjKlMnOpQrStUvWxYz012345`;
const exampleSecret = `${exampleBody}${checksumOf(exampleBody)}`;

export const mockCredentialResponse = (key = 'credential:default'): CredentialModel =>
  withFakerSeed(key, () => ({
    id: mockUuid(),
    principalId: mockUuid(),
    tenantId: mockTenantId(),
    type: 'secret',
    name: `${faker.hacker.verb()} key`,
    description: null,
    prefix: exampleSecret.slice(0, `${appConfig.slug}_sk_test_`.length + 4),
    last4: exampleSecret.slice(-10, -6),
    scopes: ['attachment:read'],
    expiresAt: null,
    revokedAt: null,
    revokedBy: null,
    lastUsedAt: null,
    createdBy: mockUuid(),
    createdAt: mockPastIsoDate(),
  }));

export const mockCreatedCredentialResponse = (key = 'createdCredential:default') => ({
  ...mockCredentialResponse(key),
  secret: exampleSecret,
});

export const mockPaginatedServiceAccountsResponse = (count = 2) => mockPaginated(mockServiceAccountResponse, count);
