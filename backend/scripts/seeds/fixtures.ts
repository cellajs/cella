/**
 * Default admin user credentials used for seeding development environments.
 */
export const defaultAdminUser = {
  password: '12345678',
  email: 'admin-test@cellajs.com',
  id: 'admin12345678',
};

/**
 * Public tenant for platform-wide content (pages, docs, etc.).
 * Reserved ID - protected from deletion at application layer.
 * Created in migration: 20260209130053_classy_tarot
 */
export const publicTenant = {
  id: 'public',
  name: 'Public',
};

/**
 * Public tenant ID constant for use in handlers.
 */
export const PUBLIC_TENANT_ID = 'public';

/**
 * Default test tenant used for development/testing environments.
 * Matches the lowercase alphanumeric format required by RLS validation.
 */
export const defaultTestTenant = {
  id: 'test01',
  name: 'Test Tenant',
};