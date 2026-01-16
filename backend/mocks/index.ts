/**
 * Barrel file for all mock generators.
 */

export {
  mockAttachment,
  mockAttachmentResponse,
} from './mock-attachment';
export { mockSuccessWithRejectedItems } from './mock-common';
export { mockMeAuthDataResponse, mockMeResponse, mockUploadTokenResponse } from './mock-me';
export {
  getMembershipOrderOffset,
  mockMembership,
  mockMembershipBase,
  mockMembershipResponse,
  mockOrganizationMembership,
} from './mock-membership';
export {
  mockOrganization,
  mockOrganizationResponse,
  resetOrganizationMockEnforcers,
} from './mock-organization';
export {
  mockPage,
  mockPageResponse,
} from './mock-page';
export {
  mockAdmin,
  mockEmail,
  mockPassword,
  mockUnsubscribeToken,
  mockUser,
  mockUserResponse,
  resetUserMockEnforcers,
} from './mock-user';

// Re-export utils
export { pastIsoDate } from './utils';

/**
 * Generates an array of mock records using the provided generator.
 * Useful for batch generating test data or seed data.
 *
 * @param generator - A function that generates a single mock record.
 * @param count - The number of records to generate (default: 10).
 * @returns An array of mock records.
 */
export const mockMany = <T>(generator: () => T, count = 10): T[] => {
  return Array.from({ length: count }, generator);
};
