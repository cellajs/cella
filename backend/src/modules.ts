/**
 * Backend module composition root: importing this file runs every module's `defineBackendModule`
 * call, so the mutation bus, yjs materializers, and shared module metadata are populated. Imported
 * once per entrypoint that reaches those registries (app `routes.ts`, MCP worker, seed runner).
 */
import '#/modules/activities/activities-module';
import '#/modules/attachment/attachment-module';
import '#/modules/auth/auth-module';
import '#/modules/domains/domains-module';
import '#/modules/entities/entities-module';
import '#/modules/mcp/mcp-module';
import '#/modules/me/me-module';
import '#/modules/memberships/memberships-module';
import '#/modules/metrics/metrics-module';
import '#/modules/organization/organization-module';
import '#/modules/requests/requests-module';
import '#/modules/seen/seen-module';
import '#/modules/system/system-module';
import '#/modules/tenants/tenants-module';
import '#/modules/user/user-module';
import '#/modules/yjs/yjs-module';
