/**
 * Mock generators for system role schemas.
 * Used for OpenAPI examples and tests.
 */

import { faker } from '@faker-js/faker';
import type { SystemRoleModel } from '#/db/schema/system-roles';
import { MOCK_REF_DATE, mockNanoid, withFakerSeed } from './utils';

/**
 * Generates a mock system role base response (without timestamps).
 * Used for SystemRoleBase schema examples.
 */
export const mockSystemRoleBase = (key = 'system-role:base') =>
  withFakerSeed(key, () => ({
    id: mockNanoid(),
    userId: mockNanoid(),
    role: 'admin' as const,
  }));

/**
 * Generates a mock system role API response with all fields.
 * Used for SystemRole schema examples.
 */
export const mockSystemRoleResponse = (key = 'system-role:default'): SystemRoleModel =>
  withFakerSeed(key, () => {
    const refDate = MOCK_REF_DATE;
    const createdAt = faker.date.past({ refDate }).toISOString();

    return {
      id: mockNanoid(),
      userId: mockNanoid(),
      role: 'admin' as const,
      createdAt,
      updatedAt: createdAt,
    };
  });

/**
 * Generates a mock system invite response.
 * Used for systemInvite endpoint example.
 */
export const mockSystemInviteResponse = (key = 'system-invite:default') =>
  withFakerSeed(key, () => ({
    data: [] as never[],
    rejectedIds: [] as string[],
    invitesSentCount: 2,
  }));
