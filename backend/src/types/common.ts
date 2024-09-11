import { OpenAPIHono } from '@hono/zod-openapi';
import type { z } from 'zod';

import type { config } from 'config';
import type { Schema } from 'hono';

import type { failWithErrorSchema } from '../lib/common-schemas';
import type { Env } from './app';

export type BaseEntityModel<T extends Entity> = {
  id: string;
  entity: T;
};

export type Entity = (typeof config.entityTypes)[number];

export type ContextEntity = (typeof config.contextEntityTypes)[number];

export type ProductEntity = (typeof config.productEntityTypes)[number];

export type OauthProviderOptions = (typeof config.oauthProviderOptions)[number];

export type NonEmptyArray<T> = readonly [T, ...T[]];

export type ErrorResponse = z.infer<typeof failWithErrorSchema>;

// biome-ignore lint/complexity/noBannedTypes: <explanation>
export class CustomHono<E extends Env = Env, S extends Schema = {}, BasePath extends string = '/'> extends OpenAPIHono<E, S, BasePath> {}
