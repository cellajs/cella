import { mockUuid, withFakerSeed } from '#/mocks';

export const mockSystemRoleBase = (key = 'system-role:base') =>
  withFakerSeed(key, () => ({ id: mockUuid(), userId: mockUuid(), role: 'admin' as const }));

export const mockSystemInviteResponse = () => ({ data: [], rejectedIds: [], invitesSentCount: 2 });
