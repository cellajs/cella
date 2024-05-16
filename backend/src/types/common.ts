import { OpenAPIHono } from '@hono/zod-openapi';
import type { User } from 'lucia';
import type { z } from 'zod';

import type { Schema } from 'hono';
import type { OrganizationModel } from '../db/schema/organizations';
import type { WorkspaceModel } from '../db/schema/workspaces';
import type { errorResponseSchema, resourceTypeSchema } from '../lib/common-schemas';

export type PageResourceType = z.infer<typeof resourceTypeSchema>;

export type ProviderId = 'GITHUB' | 'MICROSOFT' | 'GOOGLE';

export type NonEmptyArray<T> = readonly [T, ...T[]];

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export type Env = {
  Variables: {
    user: User;
    organization: OrganizationModel;
    workspace: WorkspaceModel;
    context: User | OrganizationModel | WorkspaceModel
  };
};

// biome-ignore lint/complexity/noBannedTypes: <explanation>
export class CustomHono<E extends Env = Env, S extends Schema = {}, BasePath extends string = '/'> extends OpenAPIHono<E, S, BasePath> {}
