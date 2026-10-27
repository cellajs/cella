import type { z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { type CookieName, getAuthCookie } from '#/modules/auth/general/helpers/cookie';

/** A signed auth cookie that holds JSON, read through its schema: a missing, unreadable or off-schema value reads as undefined. */
export const readJsonCookie = async <T>(ctx: Context, name: CookieName, schema: z.ZodType<T>): Promise<T | undefined> => {
  const content = await getAuthCookie(ctx, name);
  if (!content) return undefined;

  try {
    const parsed = schema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};
