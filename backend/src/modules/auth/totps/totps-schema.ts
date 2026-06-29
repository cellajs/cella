import { z } from '@hono/zod-openapi';
import { appConfig } from 'shared';

export const totpCreateBodySchema = z.object({
  code: z
    .string()
    .regex(
      new RegExp(`^\\d{${appConfig.totpConfig.digits}}$`),
      `Code must be exactly ${appConfig.totpConfig.digits} digits`,
    ),
});
