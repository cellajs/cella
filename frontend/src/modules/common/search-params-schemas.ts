import { zApiError } from 'sdk/zod.gen';
import { z } from 'zod';

/** Search params for the error routes: error page, auth error, account OAuth errors. */
export const errorSearchSchema = z.object({
  error: z.string().optional(),
  severity: zApiError.shape.severity.optional(),
});
