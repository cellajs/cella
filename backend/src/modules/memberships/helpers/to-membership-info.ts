import type { MembershipModel } from "../../../db/schema/memberships"
import type { membershipInfoType } from "../schema";

/**
 * Converts a membership to a membershipInfo object.
 *
 * @param {MembershipModel | undefined | null} membership - The membership to be converted. (Can also be undefined or null).
 * @returns {membershipInfoType | null} The converted membership information object, or null if the input is undefined or null.
 */
export const toMembershipInfo = (membership: MembershipModel | undefined | null): membershipInfoType | null => {
    return membership ? {
        id: membership.id,
        createdAt: membership.createdAt.toString(),
        role: membership.role,
        archived: membership.inactive || false,
    } : null;
}