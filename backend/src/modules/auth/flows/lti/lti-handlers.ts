import type { z } from '@hono/zod-openapi';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { redeemEmbeddedHandoff } from '#/modules/auth/core/sessions/operations/create-session';
import {
  assertFrameNavigation,
  launchStepRefusalPage,
  type StorageExchange,
  storagePage,
} from '#/modules/auth/flows/lti/helpers/platform-storage-pages';
import { registeredPage, registrationRefusalPage } from '#/modules/auth/flows/lti/helpers/registration-page';
import { authLtiRoutes, ltiContextRoutes } from '#/modules/auth/flows/lti/lti-routes';
import type { ltiLoginParamsSchema } from '#/modules/auth/flows/lti/lti-schema';
import { finishLtiLaunchOp } from '#/modules/auth/flows/lti/operations/finish-lti-launch';
import { getLtiContextsOp } from '#/modules/auth/flows/lti/operations/get-lti-contexts';
import { getLtiKeySetOp } from '#/modules/auth/flows/lti/operations/get-lti-key-set';
import { initiateLtiLoginOp } from '#/modules/auth/flows/lti/operations/initiate-lti-login';
import { receiveLtiLaunchOp } from '#/modules/auth/flows/lti/operations/receive-lti-launch';
import { registerLtiPlatformOp } from '#/modules/auth/flows/lti/operations/register-lti-platform';
import { readListPage } from '#/utils/list-page';

const app = new OpenAPIHono<Env>();

// A refusal answers a page with its own status: the platform's frame shows the outcome either way.
app.openapi(authLtiRoutes.registerLtiPlatform, async (ctx) => {
  try {
    await registerLtiPlatformOp(ctx.req.valid('query'));
    return registeredPage(ctx);
  } catch (err) {
    return registrationRefusalPage(ctx, err);
  }
});

/** Answers a launch step's storage page, or its refusal as a page the platform's frame shows: a step outside a frame is refused first. */
const answerStoragePage = async (ctx: Context<Env>, step: () => Promise<StorageExchange>) => {
  try {
    assertFrameNavigation(ctx);
    return storagePage(ctx, await step());
  } catch (err) {
    return launchStepRefusalPage(ctx, err);
  }
};

const answerLogin = (ctx: Context<Env>, params: z.infer<typeof ltiLoginParamsSchema>) => answerStoragePage(ctx, () => initiateLtiLoginOp(params));

app.openapi(authLtiRoutes.initiateLtiLogin, (ctx) => answerLogin(ctx, ctx.req.valid('query')));

app.openapi(authLtiRoutes.initiateLtiLoginByPost, (ctx) => {
  const form = ctx.req.valid('form');
  return answerLogin(ctx, { ...form, lti_storage_target: form.lti_storage_target ?? ctx.req.valid('query').lti_storage_target });
});

app.openapi(authLtiRoutes.receiveLtiLaunch, (ctx) => answerStoragePage(ctx, () => receiveLtiLaunchOp(ctx.req.valid('form'))));

app.openapi(authLtiRoutes.getLtiKeySet, async (ctx) =>
  ctx.json(await getLtiKeySetOp(ctx.req.valid('param').connectionId), 200, { 'Cache-Control': 'public, max-age=300' }),
);

app.openapi(authLtiRoutes.finishLtiLaunch, async (ctx) => {
  try {
    return ctx.redirect(await finishLtiLaunchOp(ctx, ctx.req.valid('form')), 303);
  } catch (err) {
    return launchStepRefusalPage(ctx, err);
  }
});

app.openapi(authLtiRoutes.redeemLtiHandoff, async (ctx) =>
  ctx.json({ token: await redeemEmbeddedHandoff(ctx, ctx.req.valid('json').code) }, 200, { 'Cache-Control': 'no-store' }),
);

export const authLtiHandlers = app;

const contextApp = new OpenAPIHono<Env>();

contextApp.openapi(ltiContextRoutes.listLtiContexts, async (ctx) => {
  const query = ctx.req.valid('query');
  return ctx.json(await readListPage(ctx, query, (page) => getLtiContextsOp(ctx, query, page)), 200);
});

export const ltiContextHandlers = contextApp;
