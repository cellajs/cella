import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import { User } from 'lucia';

import { OrganizationModel } from '../db/schema';
import { errorResponseSchema } from '../schemas/common';

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export type Env = {
  Variables: {
    user: User;
    organization: OrganizationModel;
  };
};

export class CustomHono extends OpenAPIHono<Env> {}
