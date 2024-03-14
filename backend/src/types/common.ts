import { OpenAPIHono } from '@hono/zod-openapi';
import type { User } from 'lucia';
import type { z } from 'zod';

import type { OrganizationModel } from '../db/schema/organizations';
import type { errorResponseSchema } from '../lib/common-schemas';

export type NonEmptyArray<T> = readonly [T, ...T[]];

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export type Env = {
  Variables: {
    user: User;
    organization: OrganizationModel;
  };
};

export class CustomHono extends OpenAPIHono<Env> {}
