import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { ltiPlatformRoutes } from '#/modules/lti-platform/lti-platform-routes';
import { approveLtiInstallationOp, rejectLtiInstallationOp } from '#/modules/lti-platform/operations/decide-lti-installation';
import { getLtiInstallationsOp } from '#/modules/lti-platform/operations/get-lti-installations';
import { startLtiToolRegistrationOp } from '#/modules/lti-platform/operations/start-lti-tool-registration';
import { readListPage, windowOf } from '#/utils/list-page';

const app = new OpenAPIHono<Env>();

app.openapi(ltiPlatformRoutes.startLtiToolRegistration, async (ctx) => ctx.json(await startLtiToolRegistrationOp(ctx, ctx.req.valid('json')), 200));

app.openapi(ltiPlatformRoutes.listLtiInstallations, async (ctx) => {
  const installations = await getLtiInstallationsOp(ctx);
  return ctx.json(await readListPage(ctx, ctx.req.valid('query'), async (page) => windowOf(installations, page)), 200);
});

app.openapi(ltiPlatformRoutes.approveLtiInstallation, async (ctx) => {
  return ctx.json(await approveLtiInstallationOp(ctx, ctx.req.valid('param').ltiInstallationId, ctx.req.valid('json')), 200);
});

app.openapi(ltiPlatformRoutes.rejectLtiInstallation, async (ctx) => {
  await rejectLtiInstallationOp(ctx, ctx.req.valid('param').ltiInstallationId);
  return ctx.body(null, 204);
});

export const ltiPlatformHandlers = app;
