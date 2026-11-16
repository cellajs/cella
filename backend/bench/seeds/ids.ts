import { type AncestorChannelType, type EntityIdColumns, type EntityType, hierarchy, type NullableAncestorType } from 'shared';
import { benchTenantId, benchUuidPrefix } from 'shared/utils/bench-identity';

/**
 * Deterministic UUID 00000000-0000-4000-{variant}-{index padded to 12 hex chars}, shared by data-setup and the
 * scenarios. An app's own entity ids build on it with a `b*` variant.
 * @public
 */
export const benchUuid = (variant: string, i: number) => `${benchUuidPrefix}${variant}-${i.toString(16).padStart(12, '0')}`;

/**
 * One variant byte per core entity, shared by the id helpers and each seed's `idVariant`, so ids and the rows they clean up cannot drift apart. Cella core owns the `a*` band, apps the `b*` band.
 *
 * @see registry.ts
 */
export const CORE_ID_VARIANTS = {
  user: 'a000',
  org: 'a001',
  email: 'a002',
  attachment: 'a005',
  membership: 'a006',
  session: 'a007',
  task: 'b008',
  project: 'b009',
} as const;

type AttachmentHomeChannel = Exclude<AncestorChannelType<'attachment'>, 'organization'>;

/**
 * The channel ids of a bench attachment below the organization, by the hierarchy's id columns: required for a strict
 * ancestor, optional for a nullable one. What `benchAttachmentHome` returns; empty in the template.
 */
export type BenchAttachmentHome = EntityIdColumns<Exclude<AttachmentHomeChannel, NullableAncestorType<'attachment'>> & EntityType, string> &
  Partial<EntityIdColumns<Extract<AttachmentHomeChannel, NullableAncestorType<'attachment'>> & EntityType, string>>;

export const TENANT_ID = benchTenantId;
export const ORG_ID = benchUuid(CORE_ID_VARIANTS.org, 0);
/** The tenant of the large list: a tenant holds one organization. */
export const LARGE_LIST_TENANT_ID = 'xblist';
/** The second bench organization, which holds the large list of `full-list-read`. */
export const LARGE_LIST_ORG_ID = benchUuid(CORE_ID_VARIANTS.org, 1);
/** Whether an attachment may live in an organization with no channel below it: the large-list organization has none. */
export const largeListSeeded = hierarchy.possibleHomeChannels('attachment').includes('organization');

export const userId = (i: number) => benchUuid(CORE_ID_VARIANTS.user, i);
export const userEmail = (i: number) => `xbench-user-${String(i).padStart(4, '0')}@xbench.local`;
export const emailId = (i: number) => benchUuid(CORE_ID_VARIANTS.email, i);
export const attachmentId = (i: number) => benchUuid(CORE_ID_VARIANTS.attachment, i);
/** Large-list attachments: past the seeded ones and below the churn band (`attachment-requests.ts`), in the attachment variant. */
export const largeListAttachmentId = (i: number) => attachmentId(0x100000 + i);
/** @public */
export const membershipId = (i: number) => benchUuid(CORE_ID_VARIANTS.membership, i);
export const sessionId = (i: number) => benchUuid(CORE_ID_VARIANTS.session, i);
/** @public */
export const taskId = (i: number) => benchUuid(CORE_ID_VARIANTS.task, i);
/** @public */
export const projectId = (i: number) => benchUuid(CORE_ID_VARIANTS.project, i);
