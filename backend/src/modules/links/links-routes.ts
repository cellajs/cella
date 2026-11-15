import { z } from '@hono/zod-openapi';
import { channelCodeLength, productLinkKeyPattern } from 'shared/share-link';
import { createXRoutes, errors, xRoute } from '#/core/x-routes';
import { publicGuard } from '#/middlewares/guard';
import { shareLinkLimiter } from '#/middlewares/rate-limiter/limiters';

const codeSchema = z
  .string()
  .length(channelCodeLength)
  .regex(new RegExp(`^[0-9][a-z0-9]{${channelCodeLength - 1}}$`));
// A letter and a number up to the int column's ten digits
const keySchema = z
  .string()
  .max(11)
  .regex(new RegExp(`^${productLinkKeyPattern}$`));

export const linkRoutes = createXRoutes(['links', 'cella'], {
  previewChannelLink: xRoute({
    method: 'get',
    path: '/{code}',
    xGuard: [publicGuard],
    xRateLimiter: [shareLinkLimiter],
    summary: 'Preview channel link',
    description: 'Serves the link preview of the channel a code names and sends a browser on to it: the target of its share link.',
    request: { params: z.object({ code: codeSchema }) },
    responses: { 200: { description: 'Success' }, ...errors(404) },
  }),
  previewProductLink: xRoute({
    method: 'get',
    path: '/{code}/{key}',
    xGuard: [publicGuard],
    xRateLimiter: [shareLinkLimiter],
    summary: 'Preview product link',
    description: 'Serves the link preview of a product named by its number in the channel a code names, such as `t42`, and sends a browser on to it.',
    request: { params: z.object({ code: codeSchema, key: keySchema }) },
    responses: { 200: { description: 'Success' }, ...errors(404) },
  }),
});
