import { z } from '@hono/zod-openapi';

export const oauthQuerySchema = z
  .object({
    type: z.enum(['auth', 'connect', 'invite', 'verify']),
    redirect: z.string().optional(),
    connectUserId: z.string().optional(),
    token: z.string().optional(),
    tokenId: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.type === 'connect') return !!data.connectUserId;
      if (data.type === 'invite') return !!data.tokenId && !!data.token;
      return true; // No extra requirements for signIn & signUp
    },
    // TODO message is deprecated in favor of 'error'? replace everywhere
    // TODO2 this doesnt work well when we need a redirect error, what to do?
    { message: "Missing required field based on 'type'" },
  );

export const oauthCallbackQuerySchema = z.object({
  code: z.string(),
  state: z.string(),
});
