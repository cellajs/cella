import type { DB } from '#/db/db';
import type { ResolvedPlacement } from '#/permissions/product-placement';

/** One seed batch: the organization it belongs to and the ancestor columns its rows carry. */
export interface AttachmentSeedPlacement {
  organizationId: string;
  tenantId: string;
  placement: ResolvedPlacement<'attachment'>;
}

/**
 * Where the attachment seed homes its rows (app-owned): one batch per organization by default, its rows in the
 * organization itself. An app whose attachments live in a channel returns one batch per home channel, or an empty
 * list to skip attachment seeding altogether (e.g. when its dev bucket carries no `seed/` objects). Creates and
 * list reads place rows by the hierarchy alone, in `#/permissions/product-placement`.
 */
export const seedAttachmentPlacements = async (_db: DB, organizations: { id: string; tenantId: string }[]): Promise<AttachmentSeedPlacement[]> =>
  organizations.map((org) => ({ organizationId: org.id, tenantId: org.tenantId, placement: {} as ResolvedPlacement<'attachment'> }));
