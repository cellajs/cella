import { faker } from '@faker-js/faker';
import { lisContextRoles } from '#/lib/lti-vocabulary';
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
      launchOrigins: ['https://peer-review.example.com', 'https://launch.peer-review.example.com'],
      description: 'Students review the drafts of their peers.',
      claims: ['iss', 'sub', 'name', 'email'],
      requestedFields: ['name' as const, 'email' as const],
      releasedFields: ['name' as const],
      requestedScopes: ['user:read' as const],
      grantedScopes: ['user:read' as const],
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

/** A member row of an installation that releases the name alone. */
export const mockLtiMemberResponse = (key = 'ltiMember:default') =>
  withFakerSeed(key, () => ({
    id: mockUuid(),
    roles: [lisContextRoles.learner],
    name: faker.person.fullName(),
  }));
