/**
 * Barrel file for all mock generators.
 */

export {
  mockOrganization,
  mockOrganizationResponse,
} from './mock-organization';

export {
  mockUser,
  mockAdmin,
  mockPassword,
  mockUnsubscribeToken,
  mockEmail,
  mockUserResponse,
} from './mock-user';

export {
  getMembershipOrderOffset,
  mockOrganizationMembership,
  mockMembershipBase,
  mockMembership,
  mockMembershipResponse,
} from './mock-membership';

export {
  mockAttachment,
  mockAttachmentResponse,
} from './mock-attachment';

export {
  mockPage,
  mockPageResponse,
} from './mock-page';

export { mockSuccessWithRejectedItems } from './mock-common';

export { mockMeAuthDataResponse, mockMeResponse, mockUploadTokenResponse } from './mock-me';

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