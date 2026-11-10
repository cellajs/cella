import { z } from 'zod';
import { errorSearchSchema } from '~/modules/common/search-params-schemas';

/** `error` and `severity` from a backend OAuth connect redirect; `connect` names an institution's connection the authentication card offers to connect, where an SSO recovery link leads. */
export const accountRouteSearchParamsSchema = errorSearchSchema.extend({ connect: z.uuid().optional().catch(undefined) });
