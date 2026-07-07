/**
 * Tenant id used by all bench traffic. Shared between the bench seeds (which
 * create the data) and the backend (which suppresses logs for it), so both
 * stay in sync.
 */
export const BENCH_TENANT_ID = 'xbench';

/**
 * UUID prefix for every deterministic bench entity id (users, orgs, attachments…).
 * Real entities use uuidv7/v4, so this prefix reliably marks bench traffic even on
 * routes without a tenant id (e.g. /me, /organizations) where only a user id is known.
 */
export const BENCH_UUID_PREFIX = '00000000-0000-4000-';
