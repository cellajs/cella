import type { MembershipModel } from '../../../db/schema/memberships';
import type { membershipInfoType } from '../schema';

/**
 * Converts a membership to a membershipInfo object.
 *
 * @param {MembershipModel} membership - The membership to be converted.
 * @returns {membershipInfoType} The converted membership information object.
 */
const convertMembershipToInfo = (membership: MembershipModel): membershipInfoType => ({
  id: membership.id,
  role: membership.role,
  archived: membership.inactive || false,
  muted: membership.muted || false,
  order: membership.order,
});

/**
 * Converts a membership to a membershipInfo object. Handles nullable input.
 *
 * @param {MembershipModel | undefined | null} membership - The membership to be converted. (Can also be undefined or null).
 * @returns {membershipInfoType | null} The converted membership information object, or null if the input is undefined or null.
 */
export const toMembershipInfo = (membership: MembershipModel | undefined | null): membershipInfoType | null => {
  return membership ? convertMembershipToInfo(membership) : null;
};

/**
 * Converts a membership to a membershipInfo object. Handles nullable input.
 *
 * @param {MembershipModel | undefined | null} membership - The membership to be converted. (Can also be undefined or null).
 * @returns {membershipInfoType | null} The converted membership information object, or null if the input is undefined or null.
 */
toMembershipInfo.nullable = (membership: MembershipModel | undefined | null): membershipInfoType | null => {
  return membership ? convertMembershipToInfo(membership) : null;
};

/**
 * Converts a membership to a membershipInfo object. Assumes the input is required.
 *
 * @param {MembershipModel} membership - The membership to be converted.
 * @returns {membershipInfoType} The converted membership information object.
 */
toMembershipInfo.required = (membership: MembershipModel): membershipInfoType => {
  return convertMembershipToInfo(membership);
};
