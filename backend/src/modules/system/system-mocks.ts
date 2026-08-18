import { mockPastIsoDate, mockUuid, withFakerSeed } from '#/mocks';
import type { SystemRoleModel } from '#/modules/system/system-roles-db';

export const mockSystemRoleBase = (key = 'system-role:base') =>
  withFakerSeed(key, () => ({
    id: mockUuid(),
    userId: mockUuid(),
    role: 'admin' as const,
  }));

export const mockSystemRoleResponse = (key = 'system-role:default'): SystemRoleModel =>
  withFakerSeed(key, () => {
    const createdAt = mockPastIsoDate();

    return {
      id: mockUuid(),
      userId: mockUuid(),
      role: 'admin' as const,
      createdAt,
      updatedAt: createdAt,
    };
  });

export const mockSystemInviteResponse = () => ({
  data: [] as never[],
  rejectedIds: [] as string[],
  invitesSentCount: 2,
});
