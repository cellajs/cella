import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { ltiNrps } from '#/lib/lti-vocabulary';
import { autoPostPage, launchRefusalPage } from '#/modules/lti-platform/helpers/launch-pages';
import { ltiLaunchRoutes, ltiMemberRoutes, ltiPlatformRoutes, ltiResourceLinkRoutes } from '#/modules/lti-platform/lti-platform-routes';
import {
  approveLtiInstallationOp,
  rejectLtiInstallationOp,
  updateLtiInstallationOp,
} from '#/modules/lti-platform/operations/decide-lti-installation';
import { getLtiInstallationsOp } from '#/modules/lti-platform/operations/get-lti-installations';
import { getLtiMembersOp } from '#/modules/lti-platform/operations/get-lti-members';
import {
  createLtiResourceLinkOp,
  deleteLtiResourceLinkOp,
  getLtiResourceLinksOp,
  updateLtiResourceLinkOp,
} from '#/modules/lti-platform/operations/manage-lti-resource-links';
import { initiateLtiLoginOp, startLtiLaunchOp } from '#/modules/lti-platform/operations/start-lti-launch';
import { startLtiToolRegistrationOp } from '#/modules/lti-platform/operations/start-lti-tool-registration';
import { readListPage, windowOf } from '#/utils/list-page';

const app = new OpenAPIHono<Env>();

app.openapi(ltiPlatformRoutes.startLtiToolRegistration, async (ctx) => ctx.json(await startLtiToolRegistrationOp(ctx, ctx.req.valid('json')), 200));

app.openapi(ltiPlatformRoutes.listLtiInstallations, async (ctx) => {
  const query = ctx.req.valid('query');
  const installations = await getLtiInstallationsOp(ctx, query);
  return ctx.json(await readListPage(ctx, query, async (page) => windowOf(installations, page)), 200);
});

app.openapi(ltiPlatformRoutes.approveLtiInstallation, async (ctx) => {
  return ctx.json(await approveLtiInstallationOp(ctx, ctx.req.valid('param').ltiInstallationId, ctx.req.valid('json')), 200);
});

app.openapi(ltiPlatformRoutes.updateLtiInstallation, async (ctx) => {
  return ctx.json(await updateLtiInstallationOp(ctx, ctx.req.valid('param').ltiInstallationId, ctx.req.valid('json')), 200);
});

app.openapi(ltiPlatformRoutes.rejectLtiInstallation, async (ctx) => {
  await rejectLtiInstallationOp(ctx, ctx.req.valid('param').ltiInstallationId);
  return ctx.body(null, 204);
});

export const ltiPlatformHandlers = app;

const resourceLinks = new OpenAPIHono<Env>();

resourceLinks.openapi(ltiResourceLinkRoutes.listLtiResourceLinks, async (ctx) => {
  const query = ctx.req.valid('query');
  const links = await getLtiResourceLinksOp(ctx, query);
  return ctx.json(await readListPage(ctx, query, async (page) => windowOf(links, page)), 200);
});

resourceLinks.openapi(ltiResourceLinkRoutes.createLtiResourceLink, async (ctx) =>
  ctx.json(await createLtiResourceLinkOp(ctx, ctx.req.valid('json')), 201),
);

resourceLinks.openapi(ltiResourceLinkRoutes.updateLtiResourceLink, async (ctx) => {
  return ctx.json(await updateLtiResourceLinkOp(ctx, ctx.req.valid('param').ltiResourceLinkId, ctx.req.valid('json')), 200);
});

resourceLinks.openapi(ltiResourceLinkRoutes.deleteLtiResourceLink, async (ctx) => {
  await deleteLtiResourceLinkOp(ctx, ctx.req.valid('param').ltiResourceLinkId);
  return ctx.body(null, 204);
});

resourceLinks.openapi(ltiResourceLinkRoutes.startLtiLaunch, async (ctx) =>
  ctx.json(await startLtiLaunchOp(ctx, ctx.req.valid('param').ltiResourceLinkId), 200),
);

export const ltiResourceLinkHandlers = resourceLinks;

const launches = new OpenAPIHono<Env>();

// A refused record answers a page too: the frame shows the outcome either way.
launches.openapi(ltiLaunchRoutes.initiateLtiLaunchLogin, async (ctx) => {
  try {
    return autoPostPage(ctx, await initiateLtiLoginOp(ctx.req.valid('query').token));
  } catch (err) {
    if (!(err instanceof AppError) || err.status !== 401) throw err;
    return launchRefusalPage(ctx, err);
  }
});

export const ltiLaunchHandlers = launches;

const members = new OpenAPIHono<Env>();

members.openapi(ltiMemberRoutes.listLtiMembers, async (ctx) => {
  const search = new URL(ctx.req.url).search;
  const { container, nextUrl } = await getLtiMembersOp(ctx, ctx.req.valid('param'), ctx.req.valid('query'), search);
  return ctx.json(container, 200, { 'Content-Type': ltiNrps.mediaType, ...(nextUrl && { Link: `<${nextUrl}>; rel="next"` }) });
});

export const ltiMemberHandlers = members;
