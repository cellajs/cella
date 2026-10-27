import { faker } from '@faker-js/faker';
import { appConfig, hierarchy } from 'shared';
import { mockPaginated, mockPastIsoDate, mockTenantId, mockUuid, withFakerSeed } from '#/mocks';
import type { WithActorRefs } from '#/modules/actors/actor-refs';
import type { ApiKeyModel } from '#/modules/service-accounts/api-keys-db';
import { checksumOf } from '#/modules/service-accounts/helpers/api-key';
import type { ServiceAccountWithActivity } from '#/modules/service-accounts/service-accounts-queries';
import { mockActorRef } from '#/schemas/entity-base-mocks';

export const mockServiceAccountResponse = (key = 'serviceAccount:default'): WithActorRefs<ServiceAccountWithActivity> => {
  const account = withFakerSeed<Omit<ServiceAccountWithActivity, 'createdBy' | 'updatedBy'>>(key, () => {
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
      createdAt,
      updatedAt: createdAt,
      lastSeenAt: createdAt,
    };
  });
  return { ...account, createdBy: mockActorRef(`${key}:created-by`), updatedBy: null };
};

/** A fixed key whose checksum is computed, so the example round-trips through `parseApiKey`; never issued. */
const exampleBody = `${appConfig.slug}_sk_test_Ab3dEfGhIjKlMnOpQrStUvWxYz012345`;
const exampleSecret = `${exampleBody}${checksumOf(exampleBody)}`;

export const mockApiKeyResponse = (key = 'apiKey:default'): WithActorRefs<ApiKeyModel> => {
  const apiKey = withFakerSeed<Omit<ApiKeyModel, 'createdBy'>>(key, () => ({
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
    createdAt: mockPastIsoDate(),
  }));
  // Outside the seed above: a seeded mock ends by unseeding the generator, so a value drawn after it differs per run.
  return { ...apiKey, createdBy: mockActorRef(`${key}:created-by`) };
};

export const mockCreatedApiKeyResponse = (key = 'createdApiKey:default') => ({ ...mockApiKeyResponse(key), secret: exampleSecret });

export const mockPaginatedServiceAccountsResponse = (count = 2) => mockPaginated(mockServiceAccountResponse, count);
