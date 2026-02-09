/**
 * Default admin user credentials used for seeding development environments.
 */
export const defaultAdminUser = {
  password: '12345678',
  email: 'admin-test@cellajs.com',
  id: 'admin12345678',
};

/**
 * System tenant for platform-wide content (pages, docs, etc.).
 * Reserved ID - protected from deletion at application layer.
 * Created in migration: 20260208100000_system_tenant_setup
 */
export const systemTenant = {
  id: 'system',
  name: 'System',
};

/**
 * System tenant ID constant for use in handlers.
 */
export const SYSTEM_TENANT_ID = 'system';

/**
 * Default test tenant used for development/testing environments.
 * Matches the 6-char lowercase alphanumeric format required by RLS validation.
 */
export const defaultTestTenant = {
  id: 'test01',
  name: 'Test Tenant',
};