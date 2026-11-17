import { OpenAPIHono } from '@hono/zod-openapi';
import { productLinkLetter } from 'shared/numbered-products';
import type { DbContext, Env } from '#/core/context';
import { AppError } from '#/core/error';
import { getAdminDb } from '#/db/db';
import { type ChannelShareLink, onBackendModuleRegister, type ProductShareLink } from '#/lib/module';
import { linkPreviewPage } from '#/modules/links/link-preview-page';
import { findChannelByCode } from '#/modules/links/links-queries';
import { linkRoutes } from '#/modules/links/links-routes';

const channelPreviews = new Map<string, ChannelShareLink['preview']>();
const productPreviews = new Map<string, ProductShareLink['preview']>();

onBackendModuleRegister(({ name, productEntity, channelShareLink, productShareLink }) => {
  if (channelShareLink) channelPreviews.set(channelShareLink.channelType, channelShareLink.preview);
  if (!productShareLink) return;
  const letter = productEntity && productLinkLetter(productEntity);
  if (!letter) throw new Error(`Module '${name}' previews share links of a product that numberedProducts does not number`);
  productPreviews.set(letter, productShareLink.preview);
});

// Share links resolve for anonymous visitors, with no tenant context to scope RLS by: previews read as admin.
// Resolved per request so a process without the admin credential still boots and only these routes fail.
const adminCtx = (): DbContext => ({ var: { db: getAdminDb('share link preview') } });

const notFound = () => new AppError(404, 'not_found', 'warn', { willRedirect: true });

const app = new OpenAPIHono<Env>();

app.openapi(linkRoutes.previewChannelLink, async (ctx) => {
  const channel = await findChannelByCode(adminCtx(), ctx.req.valid('param').code);
  const preview = channel && channelPreviews.get(channel.channelType);
  if (!channel || !preview) throw notFound();
  return ctx.html(linkPreviewPage(await preview(adminCtx(), channel)));
});

app.openapi(linkRoutes.previewProductLink, async (ctx) => {
  const { code, key } = ctx.req.valid('param');
  const channel = await findChannelByCode(adminCtx(), code);
  const preview = productPreviews.get(key[0]);
  if (!channel || !preview) throw notFound();
  return ctx.html(linkPreviewPage(await preview(adminCtx(), channel, Number(key.slice(1)))));
});

export const linkHandlers = app;
