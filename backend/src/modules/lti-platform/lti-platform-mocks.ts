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
      keySetOrigin: 'https://peer-review.example.com',
      description: 'Students review the drafts of their peers.',
      clientUri: 'https://peer-review.example.com',
      tosUri: 'https://peer-review.example.com/terms',
      policyUri: 'https://peer-review.example.com/privacy',
      claims: ['iss', 'sub', 'name', 'email'],
      requestedFields: ['name' as const, 'email' as const],
      releasedFields: ['name' as const],
      requestedScopes: ['user:read' as const],
      grantedScopes: ['user:read' as const],
      channelTypes: ['organization' as const],
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
      enabled: true,
      audience: 'members' as const,
      createdAt,
      updatedAt: createdAt,
    };
  });
  return { ...resourceLink, createdBy: mockActorRef(`${key}:created-by`), updatedBy: mockActorRef(`${key}:updated-by`) };
};

/** A page of an LTI context's members for an installation that releases the name alone. */
export const mockLtiMembershipContainerResponse = (key = 'ltiMembershipContainer:default') =>
  withFakerSeed(key, () => {
    const organizationId = mockUuid();
    return {
      id: `https://app.example.com/api/tenants/example-tenant/organizations/${organizationId}/lti-members/organization/${organizationId}?limit=1`,
      context: { id: organizationId, label: 'biology-101', title: 'Introduction to biology' },
      members: [{ user_id: mockUuid(), roles: [lisContextRoles.learner], status: 'Active' as const, name: faker.person.fullName() }],
    };
  });
