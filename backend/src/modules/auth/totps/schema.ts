import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';

export const totpVerificationBodySchema = z.object({
  code: z.string().regex(new RegExp(`^\\d{${appConfig.totpConfig.digits}}$`), `Code must be exactly ${appConfig.totpConfig.digits} digits`),
});
