import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { defaultHook } from '#/utils/default-hook';
import { createServiceAccountOp } from './operations/create-service-account';
import { createCredentialOp, getCredentialsOp, revokeCredentialOp } from './operations/credentials';
import { getServiceAccountsOp } from './operations/get-service-accounts';
import { updateServiceAccountOp } from './operations/update-service-account';
import { serviceAccountRoutes } from './service-accounts-routes';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(serviceAccountRoutes.createServiceAccount, async (ctx) => {
  const data = await createServiceAccountOp(ctx, ctx.req.valid('json'));
  return ctx.json(data, 201);
});

app.openapi(serviceAccountRoutes.getServiceAccounts, async (ctx) => {
  const data = await getServiceAccountsOp(ctx, ctx.req.valid('query'));
  return ctx.json(data, 200);
});

app.openapi(serviceAccountRoutes.updateServiceAccount, async (ctx) => {
  const { id } = ctx.req.valid('param');
  const data = await updateServiceAccountOp(ctx, id, ctx.req.valid('json'));
  return ctx.json(data, 200);
});

app.openapi(serviceAccountRoutes.getCredentials, async (ctx) => {
  const { id } = ctx.req.valid('param');
  const data = await getCredentialsOp(ctx, id);
  return ctx.json(data, 200);
});

app.openapi(serviceAccountRoutes.createCredential, async (ctx) => {
  const { id } = ctx.req.valid('param');
  const data = await createCredentialOp(ctx, id, ctx.req.valid('json'));
  return ctx.json(data, 201);
});

app.openapi(serviceAccountRoutes.revokeCredential, async (ctx) => {
  const { id, credentialId } = ctx.req.valid('param');
  const data = await revokeCredentialOp(ctx, id, credentialId);
  return ctx.json(data, 200);
});

export const serviceAccountHandlers = app;
