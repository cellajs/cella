import { hierarchy } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import type { DB } from '#/db/db';
import type { attachmentsTable } from '#/modules/attachment/attachment-db';

/**
 * Attachment placement seam (pinned; apps own their fill). cella homes attachments at the
 * organization only, so this default exposes no placement fields, resolves every row org-homed,
 * reads lists org-wide and seeds one batch per organization. An app that re-homes attachments on
 * its channel chain (nullable ancestor columns, deepest non-null = home) replaces this file; the
 * cella-owned schema, list and create ops and the seed call through these exports, so the swap
 * stays local to it.
 */

/** Create-body placement fields, spread into the create-item schema: the deepest home id only. */
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
 * Column holding a row's home channel id: list reads compile the caller's grant scope against it.
 * Org-homed rows reuse the organization column; an app with one strict home names that column.
 */
export const attachmentHomeColumnKey = 'organizationId' satisfies keyof typeof attachmentsTable.$inferSelect;

/**
 * Home channel a list or delta read narrows to, from the `channelId` query param; undefined reads
 * org-wide. Apps validate the id as one of their home channels (requiring read access on it).
 * Org-homed default: the organization is the only home, so any other id is unknown.
 */
export const resolveAttachmentHomeScope = async (
  ctx: AuthContext,
  channelId: string | undefined,
): Promise<string | undefined> => {
  if (!channelId || channelId === ctx.var.organization.id) return undefined;
  throw new AppError(404, 'not_found', 'warn', { entityType: hierarchy.rootChannelType });
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
