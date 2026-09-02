import { appConfig, hierarchy } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import type { DB } from '#/db/db';
import type { attachmentsTable } from '#/modules/attachment/attachment-db';
import { getValidChannel } from '#/permissions/get-valid-channel';

/**
 * Create-body placement fields, spread into the create-item schema: the deepest home id only.
 * This file is the attachment placement seam (pinned; apps own their fill): cella homes attachments
 * at the organization, so the defaults below expose no fields, resolve every row org-homed, read
 * lists org-wide and seed one batch per organization. An app re-homing attachments on its channel
 * chain replaces the file; the cella-owned schema, list and create ops and the seed call through it.
 */
export const attachmentPlacementFieldsSchema = {};

/** A create-body item as the placement seam sees it; apps narrow to their placement fields. */
export type AttachmentPlacementInput = Record<string, unknown>;

/**
 * Ancestor id columns to stamp on the inserted row; empty = org-homed. May also carry `publicAt`
 * when the app inherits the home channel's public-read flag server-side.
 */
export type ResolvedAttachmentPlacement = Record<string, string | null>;

/**
 * Per-item create-body validation, anchored at the returned path relative to the item. Apps
 * reject ambiguous placement here (more than one home id per item); with no placement fields
 * there is nothing to reject.
 */
export const validateAttachmentPlacement = (
  _item: AttachmentPlacementInput,
): { path: (string | number)[]; message: string } | null => null;

/**
 * Ancestor columns for one create-body item; the org-homed default stamps none. Apps resolve
 * the most specific client-sent id to a real row (requiring read access on it) and derive the
 * chain above it server-side, never from client input.
 */
export const resolveAttachmentPlacement = async (
  _ctx: AuthContext,
  _input: AttachmentPlacementInput,
): Promise<ResolvedAttachmentPlacement> => ({});

/**
 * The channel type attachments home at: the deepest strict ancestor, else the root. Apps with
 * nullable placement (rows home at any depth) keep the root here and read org-wide.
 */
const homeChannelType =
  hierarchy
    .getOrderedAncestors('attachment')
    .find((type) => !hierarchy.getNullableAncestors('attachment').includes(type)) ?? hierarchy.rootChannelType;

/** Column holding a row's home channel id: list reads compile the caller's grant scope against it. */
export const attachmentHomeColumnKey = appConfig.entityIdColumnKeys[
  homeChannelType
] as keyof typeof attachmentsTable.$inferSelect;

/**
 * Home channel a list or delta read narrows to, from the `channelId` query param; undefined reads
 * org-wide. The organization itself (or no id) is org-wide; any other id must be a readable channel
 * of the home type. With the root as home there is no narrower channel, so other ids are unknown.
 */
export const resolveAttachmentHomeScope = async (
  ctx: AuthContext,
  channelId: string | undefined,
): Promise<string | undefined> => {
  if (!channelId || channelId === ctx.var.organization.id) return undefined;
  // Widened so a single-channel hierarchy does not narrow `homeChannelType` to never below.
  const rootChannelType: string = hierarchy.rootChannelType;
  if (homeChannelType === rootChannelType) {
    throw new AppError(404, 'not_found', 'warn', { entityType: hierarchy.rootChannelType });
  }
  const { entity } = await getValidChannel(ctx, channelId, homeChannelType, 'read');
  return entity.id;
};

/** One seed batch: the organization it belongs to and the ancestor columns its rows carry. */
export interface AttachmentSeedPlacement {
  organizationId: string;
  tenantId: string;
  placement: ResolvedAttachmentPlacement;
}

/**
 * Where the attachment seed homes its rows: one org-homed batch per organization by default. Apps
 * return one batch per home channel, or an empty list to skip attachment seeding altogether
 * (e.g. when their dev bucket carries no `seed/` objects).
 */
export const seedAttachmentPlacements = async (
  _db: DB,
  organizations: { id: string; tenantId: string }[],
): Promise<AttachmentSeedPlacement[]> =>
  organizations.map((org) => ({ organizationId: org.id, tenantId: org.tenantId, placement: {} }));
