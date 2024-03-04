import { OpenAPIHono } from '@hono/zod-openapi';
import { User } from 'lucia';
import { z } from 'zod';

import { errorResponseSchema } from '../lib/common-schemas';
import { OrganizationModel } from '../db/schema/organizations';

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export type Env = {
  Variables: {
    user: User;
    organization: OrganizationModel;
  };
};

export class CustomHono extends OpenAPIHono<Env> {}
