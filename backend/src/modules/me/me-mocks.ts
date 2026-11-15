import { faker } from '@faker-js/faker';
import { mockNanoid, mockPaginated, mockRefDate, mockUuid, withFakerSeed } from '#/mocks';
import { mockInviteeInvitationResponse } from '#/modules/memberships/memberships-mocks';
import { resourceUri } from '#/modules/oauth-server/resources';
import { mockUserResponse } from '#/modules/user/user-mocks';
import { mockChannelBase } from '#/schemas/entity-base-mocks';

export const mockMeResponse = (key = 'me:default') => ({
  user: mockUserResponse(`${key}:user`),
  isSystemAdmin: false,
  session: withFakerSeed(`${key}:session`, () => ({ id: mockUuid(), expiresAt: faker.date.future({ refDate: mockRefDate }).toISOString() })),
});

export const mockUploadTokenResponse = (key = 'upload-token:default') =>
  withFakerSeed(key, () => {
    const expiresAt = faker.date.soon({ days: 1, refDate: mockRefDate });

    return {
      publicBucket: false,
      sub: mockNanoid(),
      s3: true,
      signature: faker.string.alphanumeric(64),
      params: { auth: { key: `uploads/${mockNanoid()}`, expires: expiresAt.toISOString() } },
    };
  });

const mockPendingInvitationResponse = (key = 'pending-invitation:default') => ({
  entity: mockChannelBase(`${key}:entity`),
  invitation: mockInviteeInvitationResponse(`${key}:invitation`),
  organizationName: null,
});

export const mockPaginatedInvitationsResponse = (count = 2) => mockPaginated(mockPendingInvitationResponse, count);

export const mockConnectedApp = () => ({
  id: '01J9Z2Q0X7ZQ4S5M8NX3F2ABCD',
  clientId: 'https://vscode.dev/oauth/client-metadata.json',
  clientName: 'Visual Studio Code',
  scopes: ['attachment:read'],
  resources: [resourceUri({ face: 'mcp', tenantId: 'tenant01', organizationId: 'org01' })],
  createdAt: '2026-09-22T10:00:00.000Z',
  expiresAt: '2026-10-22T10:00:00.000Z',
});
