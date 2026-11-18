import { type ChannelEntityType, hierarchy } from 'shared';
import type { DbContext } from '#/core/context';
import type { MembershipEntity } from '#/lib/module';
import type { LtiConnection } from '#/modules/connections/connections-db';
import type { MembershipModel } from '#/modules/memberships/memberships-db';
import type { OrganizationModel } from '#/modules/organization/organization-db';

/** An LTI context as a launch names it (LTI Core 1.3, section 5.4.1). */
export interface LtiContext {
  id: string;
  label?: string;
  title?: string;
  /** LIS context types (`lisContextTypes`); empty when the platform sends none. */
  types: string[];
}

/** What creating a context's channel is handed. */
export interface LtiContextChannelFacts {
  /** The organization of the connection's tenant: the channel goes below it. */
  organization: OrganizationModel;
  context: LtiContext;
  /** The person whose launch creates it: an Instructor or Administrator of the context. */
  createdBy: string;
}

/** What a launch hands `ltiContextRole`. */
export interface LtiRoleFacts {
  /** The launch's LTI roles, as full URIs (`lisContextRoles`). */
  ltiRoles: string[];
  /** The connection the launch came through: an app may map roles per institution. */
  connection: LtiConnection;
}

/**
 * The channel type an LTI context becomes. The app fills this pinned file: a channel below the organization (a course,
 * a project), or the organization itself. The template's answer: the organization, its only channel. A launch without
 * a context opens the organization either way.
 */
export const ltiContextChannelType: ChannelEntityType = 'organization';

/**
 * Creates the channel an LTI context becomes, below the organization and named after the course, on the first launch
 * by an Instructor or Administrator of the context; it runs inside the launch's transaction. Never called while
 * `ltiContextChannelType` is the organization, which is the template's answer.
 */
export const createLtiContextChannel = async (_ctx: DbContext, { context }: LtiContextChannelFacts): Promise<MembershipEntity> => {
  throw new Error(`createLtiContextChannel: the template creates no channel for LTI context ${context.id}`);
};

/**
 * The role a launch gives in the context's channel. Re-applied at every launch: a role in a channel below the
 * organization follows the launch up and down, an organization role only goes up. An LTI administrator never becomes
 * an app admin. The template's answer: the least privileged organization role, whatever the platform sends.
 */
export const ltiContextRole = (_facts: LtiRoleFacts): MembershipModel['role'] => hierarchy.getLeastPrivilegedRole(ltiContextChannelType);
