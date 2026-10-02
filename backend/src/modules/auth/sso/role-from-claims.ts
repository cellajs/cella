import { hierarchy } from 'shared';
import type { SsoClaims } from '#/modules/auth/sso/helpers/federation-client';
import type { ConnectionModel } from '#/modules/connections/connections-db';
import type { MembershipModel } from '#/modules/memberships/memberships-db';

/** What an institution sign-in hands the role seam. */
export interface SsoRoleFacts {
  /** The federation's config key, which is also the identity's issuer. */
  federation: string;
  /** The connection the sign-in came through: its tenant owns the organization the membership is in. */
  connection: ConnectionModel;
  /** Every verified claim of the sign-in, not only the snapshot kept on the identity row. */
  claims: SsoClaims;
}

/**
 * The role of the membership an institution sign-in grants in the connection's organization. This file is the role
 * seam (pinned; apps own their fill): an app maps what the institution asserts, such as `eduperson_affiliation`, to
 * its own organization roles. The default is the least-privileged role.
 *
 * Consulted once, when the membership is created: on a first sign-in, or when a user connects their institution
 * account and holds no membership there yet. Later sign-ins never change a role, and an invitation to the
 * organization names its own role, so it never reaches this function.
 */
export const roleFromClaims = (_facts: SsoRoleFacts): MembershipModel['role'] => hierarchy.getLeastPrivilegedRole('organization');
