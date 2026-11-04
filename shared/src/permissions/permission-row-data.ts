import { z } from 'zod';
import { appConfig } from '../config-builder/app-config.ts';
import { recordFromKeys } from '../config-builder/utils.ts';

/**
 * The columns of a product row that decide who may read it and where it is, as the CDC worker sends them: all the API
 * reads of a row from a message. Every product table holds `id` and `organizationId`; a column the table lacks is absent.
 */
export const permissionRowDataSchema = z.object({
  ...recordFromKeys(
    appConfig.channelEntityTypes.map((channelType) => appConfig.entityIdColumnKeys[channelType]),
    () => z.string().nullable().optional(),
  ),
  id: z.string(),
  organizationId: z.string(),
  createdBy: z.string().nullable().optional(),
  deletedAt: z.string().nullable().optional(),
  public: z.boolean().optional(),
  publishedAt: z.string().nullable().optional(),
});

/** A product row's permission columns, as a CDC message carries them. */
export type PermissionRowData = z.infer<typeof permissionRowDataSchema>;
