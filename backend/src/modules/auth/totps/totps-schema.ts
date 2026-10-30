import { z } from '@hono/zod-openapi';
import { appConfig } from 'shared';

export const totpCodeBodySchema = z.object({
  code: z
    .string()
    .max(appConfig.totp.digits)
    .regex(new RegExp(`^\\d{${appConfig.totp.digits}}$`), `Code must be exactly ${appConfig.totp.digits} digits`),
});
