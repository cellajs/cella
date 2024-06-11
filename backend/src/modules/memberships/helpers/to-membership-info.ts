import type { MembershipModel } from "../../../db/schema/memberships"
import type { membershipInfoType } from "../schema";

export const toMembershipInfo = (membership: MembershipModel | undefined | null): membershipInfoType | null => {
    return membership ? {
        id: membership.id,
        createdAt: membership.createdAt.toString(),
        role: membership.role,
        archived: membership.inactive || false,
    } : null;
}