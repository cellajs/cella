import type { z } from '@hono/zod-openapi';
import { appConfig, type ChannelEntityType, hierarchy } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import type { DB } from '#/db/db';
import type { attachmentsTable } from '#/modules/attachment/attachment-db';
import { getValidChannel } from '#/permissions/get-valid-channel';
import { validUuidSchema } from '#/schemas';

const rootChannelType: string = hierarchy.rootChannelType;
const nullableAncestors = new Set<string>(hierarchy.getNullableAncestors('attachment'));
/** Sub-organization ancestors an attachment can home at, deepest first; none in cella. */
const placementAncestors = hierarchy.getOrderedAncestors('attachment').filter((type) => type !== rootChannelType);
const placementKey = (type: string) => appConfig.entityIdColumnKeys[type as ChannelEntityType];

/**
 * Create-body placement fields, spread into the create-item schema. This file is the attachment
 * placement seam (pinned; apps own their fill), with defaults derived from the hierarchy: the
 * client sends the deepest home id only (required when that home is a strict ancestor, optional
 * when nullable), the chain above it is read off the resolved row, and every other sub-organization
 * ancestor column is null. cella has no sub-organization ancestors, so its rows are org-homed.
 */
export const attachmentPlacementFieldsSchema = Object.fromEntries(
  placementAncestors.map((type) => [
    placementKey(type),
    nullableAncestors.has(type) ? validUuidSchema.optional() : validUuidSchema,
  ]),
) as Record<string, z.ZodType<string | undefined>>;

/** A create-body item as the placement seam sees it; apps narrow to their placement fields. */
export type AttachmentPlacementInput = Record<string, unknown>;

/** Ancestor id columns to stamp on the inserted row (null above the home); empty = org-homed. */
export type ResolvedAttachmentPlacement = Record<string, string | null>;

const providedHome = (item: AttachmentPlacementInput) =>
  placementAncestors.filter((type) => typeof item[placementKey(type)] === 'string' && item[placementKey(type)]);

/** Per-item create-body validation, anchored at the returned path relative to the item: one home id at most. */
export const validateAttachmentPlacement = (
  item: AttachmentPlacementInput,
): { path: (string | number)[]; message: string } | null => {
  const provided = providedHome(item);
  if (provided.length <= 1) return null;
  return {
    path: [placementKey(provided[0])],
    message: 'Ambiguous placement: send only the deepest home id (its ancestors are derived server-side)',
  };
};

/**
 * Ancestor columns for one create-body item: the deepest provided id, resolved to a readable
 * channel row, plus that row's own ancestor ids; never client input above the home. No id means
 * org-homed, which the fields schema only allows when no strict ancestor exists.
 */
export const resolveAttachmentPlacement = async (
  ctx: AuthContext,
  input: AttachmentPlacementInput,
): Promise<ResolvedAttachmentPlacement> => {
  const placement: ResolvedAttachmentPlacement = Object.fromEntries(
    placementAncestors.map((type) => [placementKey(type), null]),
  );
  const home = providedHome(input)[0];
  if (!home) return placement;

  const { entity } = await getValidChannel(ctx, input[placementKey(home)] as string, home, 'read');
  const row = entity as Record<string, unknown>;
  placement[placementKey(home)] = entity.id;
  for (const ancestor of hierarchy.getOrderedAncestors(home)) {
    if (ancestor === rootChannelType) break;
    const id = row[placementKey(ancestor)];
    placement[placementKey(ancestor)] = typeof id === 'string' ? id : null;
  }
  return placement;
};

/**
 * The channel type attachments home at: the deepest strict ancestor, else the root. Apps with
 * nullable placement (rows home at any depth) keep the root here and read org-wide.
 */
const homeChannelType =
  hierarchy.getOrderedAncestors('attachment').find((type) => !nullableAncestors.has(type)) ?? hierarchy.rootChannelType;

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
