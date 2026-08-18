import { z } from '@hono/zod-openapi';
import type { TokenType } from 'shared';
import { validEmailSchema } from '#/schemas';

/** Token types invokable via a link. `confirm-mfa` is excluded: it lives only in a cookie during an MFA challenge and invoking it would clobber that cookie. */
export const invokableTokenTypes = [
  'email-verification',
  'oauth-verification',
  'invitation',
  'magic',
] as const satisfies readonly TokenType[];

export const emailBodySchema = z.object({
  email: validEmailSchema,
});
export const tokenWithDataSchema = z.object({
  email: z.email(),
  userId: z.string().optional(),
  inactiveMembershipId: z.string().optional(),
});
