import { mockPastIsoDate, mockUuid, withFakerSeed } from '#/mocks';
import { mockActorRef } from '#/schemas/entity-base-mocks';

export const mockLtiInstallationResponse = (key = 'ltiInstallation:default') => {
  const installation = withFakerSeed(key, () => {
    const createdAt = mockPastIsoDate();
    return {
      id: mockUuid(),
      clientId: mockUuid(),
      name: 'Peer review',
      logoUri: 'https://peer-review.example.com/logo.svg',
      domain: 'peer-review.example.com',
      description: 'Students review the drafts of their peers.',
      claims: ['iss', 'sub', 'name', 'email'],
      requestedFields: ['name' as const, 'email' as const],
      releasedFields: ['name' as const],
      status: 'active' as const,
      approvedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    };
  });
  return { ...installation, createdBy: mockActorRef(`${key}:created-by`), updatedBy: mockActorRef(`${key}:updated-by`) };
};

export const mockLtiResourceLinkResponse = (key = 'ltiResourceLink:default') => {
  const resourceLink = withFakerSeed(key, () => {
    const createdAt = mockPastIsoDate();
    return {
      id: mockUuid(),
      channelType: 'organization' as const,
      channelId: mockUuid(),
      installationId: mockUuid(),
      title: 'Peer review',
      custom: { round: '1' },
      createdAt,
      updatedAt: createdAt,
    };
  });
  return { ...resourceLink, createdBy: mockActorRef(`${key}:created-by`), updatedBy: mockActorRef(`${key}:updated-by`) };
};
