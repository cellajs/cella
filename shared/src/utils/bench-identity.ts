/** Shared by the bench seeds that create the data and the backend that suppresses its logs. */
export const benchTenantId = 'xbench';

/**
 * UUID prefix on every deterministic bench entity id. Real entities use uuidv7/v4, so the prefix
 * still marks bench traffic on routes without a tenant id, such as /me and /organizations.
 */
export const benchUuidPrefix = '00000000-0000-4000-';
