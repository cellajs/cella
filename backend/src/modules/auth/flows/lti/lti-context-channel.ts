import { type ChannelEntityType, hierarchy } from 'shared';
import type { DbContext } from '#/core/context';
import { isLisContextRole, isLisContextType, lisContextRoles } from '#/lib/lti-vocabulary';
import type { MembershipEntity } from '#/lib/module';
import type { LtiConnection } from '#/modules/connections/connections-db';
import type { MembershipModel } from '#/modules/memberships/memberships-db';
import type { OrganizationModel } from '#/modules/organization/organization-db';

/** An LTI context as a launch names it (LTI Core 1.3, section 5.4.1). */
export interface LtiContext {
  id: string;
  label?: string;
  title?: string;
  /** Context types as full URIs, a LIS type's short name mapped (`lisContextTypes`); empty when the platform sends none. */
  types: string[];
}

/** What creating a context's channel is handed. */
export interface LtiContextChannelFacts {
  /** The organization of the connection's tenant: the channel goes below it. */
  organization: OrganizationModel;
  context: LtiContext;
  /** The channel type `ltiContextChannelType` answered for the context. */
  channelType: ChannelEntityType;
  /** The person whose launch creates it, who sets the context up (`ltiContextRole`). */
  createdBy: string;
}

/** What a launch or a member import hands `ltiContextRole`. */
export interface LtiRoleFacts {
  /**
   * The person's LTI roles as full URIs, as the platform sent them: context roles (`lisContextRoles`), and any
   * institution or system roles beside them (`lisInstitutionRoles`, `lisSystemRoles`). A platform's admin who is not
   * enrolled may arrive with institution roles alone.
   */
  ltiRoles: string[];
  /** The type of the context's channel the role is for. */
  channelType: ChannelEntityType;
  /** The connection the launch came through, without its key: an app may map roles per institution. */
  connection: Omit<LtiConnection, 'privateJwk'>;
}

/**
 * The channel type an LTI context becomes, or null for a launch that counts as one without a context, which admits
 * nobody new. The app fills this pinned file: a channel below the organization, one type per kind of context (a
 * course, a group), or the organization itself. The template's answer: the organization for a LIS course or group type,
 * or for no type, which some platforms send; null for any other, such as Canvas's `Account` and `User` navigation.
 */
export const ltiContextChannelType = ({ types }: LtiContext): ChannelEntityType | null =>
  !types.length || types.some(isLisContextType) ? 'organization' : null;

/**
 * Creates the channel an LTI context becomes, below the organization and named after the context, on the first launch
 * by someone who sets it up (`ltiContextRole`); it runs inside the launch's transaction. Never called while
 * `ltiContextChannelType` answers the organization, which is the template's answer.
 */
export const createLtiContextChannel = async (_ctx: DbContext, { context }: LtiContextChannelFacts): Promise<MembershipEntity> => {
  throw new Error(`createLtiContextChannel: the template creates no channel for LTI context ${context.id}`);
};

/** The context roles the template's `ltiContextRole` lets set a context up. */
const setUpRoles: readonly string[] = [lisContextRoles.instructor, lisContextRoles.administrator];

/**
 * The role a launch or an import gives in a channel of `channelType`, or null for none: the launch is refused with a
 * page, and the import leaves the person out. An answer that is no role of that type gives its least privileged role.
 * Re-applied at every launch: a role in a channel below the organization follows the launch up and down, an
 * organization role only goes up. An LTI administrator never becomes an app admin. Whoever this gives a role that may
 * update a channel of that type, as the permission engine judges the role alone, sets the context up: their launch
 * creates its channel and starts its member import. The template's answer, by case:
 * - Instructor or Administrator of the context: the most privileged role: they set it up;
 * - any other context role: the least privileged role;
 * - institution or system roles alone, or no roles at all: null.
 */
export const ltiContextRole = ({ channelType, ltiRoles }: LtiRoleFacts): MembershipModel['role'] | null => {
  if (ltiRoles.some((role) => setUpRoles.includes(role))) return hierarchy.getMostPrivilegedRole(channelType);
  return ltiRoles.some(isLisContextRole) ? hierarchy.getLeastPrivilegedRole(channelType) : null;
};
