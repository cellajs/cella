import { z } from '@hono/zod-openapi';
import { appConfig } from 'shared';

export const totpCreateBodySchema = z.object({
  code: z
    .string()
    .regex(new RegExp(`^\\d{${appConfig.totp.digits}}$`), `Code must be exactly ${appConfig.totp.digits} digits`),
});
