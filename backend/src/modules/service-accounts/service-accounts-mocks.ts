import { faker } from '@faker-js/faker';
import { appConfig, hierarchy } from 'shared';
import { mockPaginated, mockPastIsoDate, mockTenantId, mockUuid, withFakerSeed } from '#/mocks';
import { checksumOf } from '#/modules/service-accounts/helpers/api-key';
import type { ApiKeyWithCreator } from '#/modules/service-accounts/operations/with-api-key-creators';
import type { ServiceAccountWithActivity } from '#/modules/service-accounts/service-accounts-queries';
import { mockUserMinimalBase } from '#/schemas/entity-base-mocks';

export const mockServiceAccountResponse = (key = 'serviceAccount:default'): ServiceAccountWithActivity =>
  withFakerSeed(key, () => {
    const organizationId = mockUuid();
    const createdAt = mockPastIsoDate();
    return {
      id: mockUuid(),
      tenantId: mockTenantId(),
      name: `${faker.hacker.noun()} bot`,
      status: 'active',
      bindings: [
        {
          channelType: 'organization',
          channelId: organizationId,
          organizationId,
          role: hierarchy.getLeastPrivilegedRole('organization'),
        },
      ],
      oauthClientId: null,
      createdBy: mockUuid(),
      createdAt,
      updatedAt: createdAt,
      updatedBy: null,
      lastSeenAt: createdAt,
    };
  });

/** A fixed key whose checksum is computed, so the example round-trips through `parseApiKey`; never issued. */
const exampleBody = `${appConfig.slug}_sk_test_Ab3dEfGhIjKlMnOpQrStUvWxYz012345`;
const exampleSecret = `${exampleBody}${checksumOf(exampleBody)}`;

export const mockApiKeyResponse = (key = 'apiKey:default'): ApiKeyWithCreator =>
  withFakerSeed(key, () => ({
    id: mockUuid(),
    actorId: mockUuid(),
    tenantId: mockTenantId(),
    name: `${faker.hacker.verb()} key`,
    prefix: exampleSecret.slice(0, `${appConfig.slug}_sk_test_`.length + 4),
    last4: exampleSecret.slice(-10, -6),
    scopes: ['attachment:read'],
    expiresAt: null,
    revokedAt: null,
    revokedBy: null,
    createdBy: mockUserMinimalBase(`${key}:created-by`),
    createdAt: mockPastIsoDate(),
  }));

export const mockCreatedApiKeyResponse = (key = 'createdApiKey:default') => ({ ...mockApiKeyResponse(key), secret: exampleSecret });

export const mockPaginatedServiceAccountsResponse = (count = 2) => mockPaginated(mockServiceAccountResponse, count);
