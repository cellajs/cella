import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { createApiKeyOp } from '#/modules/service-accounts/operations/create-api-key';
import { createServiceAccountOp } from '#/modules/service-accounts/operations/create-service-account';
import { getApiKeysOp } from '#/modules/service-accounts/operations/get-api-keys';
import { getServiceAccountsOp } from '#/modules/service-accounts/operations/get-service-accounts';
import { revokeApiKeyOp } from '#/modules/service-accounts/operations/revoke-api-key';
import { updateServiceAccountOp } from '#/modules/service-accounts/operations/update-service-account';
import { serviceAccountRoutes } from '#/modules/service-accounts/service-accounts-routes';
import { defaultHook } from '#/utils/default-hook';
import { readListPage } from '#/utils/list-page';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(serviceAccountRoutes.createServiceAccount, async (ctx) => {
  const data = await createServiceAccountOp(ctx, ctx.req.valid('json'));
  return ctx.json(data, 201);
});

app.openapi(serviceAccountRoutes.listServiceAccounts, async (ctx) => {
  const query = ctx.req.valid('query');
  return ctx.json(await readListPage(ctx, query, (page) => getServiceAccountsOp(ctx, query, page)), 200);
});

app.openapi(serviceAccountRoutes.updateServiceAccount, async (ctx) => {
  const { serviceAccountId } = ctx.req.valid('param');
  const data = await updateServiceAccountOp(ctx, serviceAccountId, ctx.req.valid('json'));
  return ctx.json(data, 200);
});

app.openapi(serviceAccountRoutes.listApiKeys, async (ctx) => {
  const { serviceAccountId } = ctx.req.valid('param');
  return ctx.json(await readListPage(ctx, ctx.req.valid('query'), (page) => getApiKeysOp(ctx, serviceAccountId, page)), 200);
});

app.openapi(serviceAccountRoutes.createApiKey, async (ctx) => {
  const { serviceAccountId } = ctx.req.valid('param');
  const data = await createApiKeyOp(ctx, serviceAccountId, ctx.req.valid('json'));
  return ctx.json(data, 201);
});

app.openapi(serviceAccountRoutes.revokeApiKey, async (ctx) => {
  const { serviceAccountId, apiKeyId } = ctx.req.valid('param');
  const data = await revokeApiKeyOp(ctx, serviceAccountId, apiKeyId);
  return ctx.json(data, 200);
});

export const serviceAccountHandlers = app;
