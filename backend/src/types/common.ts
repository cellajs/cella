import { OpenAPIHono } from '@hono/zod-openapi';
import type { User } from 'lucia';
import type { AnyZodObject, ZodSchema, ZodType, z } from 'zod';

import type { ResponseConfig, ZodContentObject, ZodMediaTypeObject, ZodRequestBody } from '@asteasolutions/zod-to-openapi';
import type { Handler, Input, MiddlewareHandler, Schema, ToSchema, TypedResponse } from 'hono';
import type { OrganizationModel } from '../db/schema/organizations';
import type { errorResponseSchema } from '../lib/common-schemas';
import type { RouteConfig } from '../lib/route-config';

export type NonEmptyArray<T> = readonly [T, ...T[]];

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export type Env = {
  Variables: {
    user: User;
    organization: OrganizationModel;
  };
};

type ConvertPathType<T extends string> = T extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${ConvertPathType<Rest>}` : T;

type RequestTypes = {
  body?: ZodRequestBody;
  params?: AnyZodObject;
  query?: AnyZodObject;
  cookies?: AnyZodObject;
  headers?: AnyZodObject | ZodType<unknown>[];
};

type RequestPart<R extends RouteConfig['route'], Part extends string> = Part extends keyof R['request']
  ? R['request'][Part]
  : // biome-ignore lint/complexity/noBannedTypes: required for type inference
    {};

type InputTypeBase<R extends RouteConfig['route'], Part extends string, Type extends string> = R['request'] extends RequestTypes
  ? RequestPart<R, Part> extends AnyZodObject
    ? {
        in: { [K in Type]: z.input<RequestPart<R, Part>> };
        out: { [K in Type]: z.output<RequestPart<R, Part>> };
      }
    : // biome-ignore lint/complexity/noBannedTypes: required for type inference
      {}
  : // biome-ignore lint/complexity/noBannedTypes: required for type inference
    {};

type InputTypeParam<R extends RouteConfig['route']> = InputTypeBase<R, 'params', 'param'>;
type InputTypeQuery<R extends RouteConfig['route']> = InputTypeBase<R, 'query', 'query'>;
type InputTypeHeader<R extends RouteConfig['route']> = InputTypeBase<R, 'headers', 'header'>;
type InputTypeCookie<R extends RouteConfig['route']> = InputTypeBase<R, 'cookies', 'cookie'>;

type IsJson<T> = T extends string ? (T extends `application/json${infer _Rest}` ? 'json' : never) : never;

type InputTypeJson<R extends RouteConfig['route']> = R['request'] extends RequestTypes
  ? R['request']['body'] extends ZodRequestBody
    ? R['request']['body']['content'] extends ZodContentObject
      ? IsJson<keyof R['request']['body']['content']> extends never
        ? // biome-ignore lint/complexity/noBannedTypes: required for type inference
          {}
        : // biome-ignore lint/suspicious/noExplicitAny: required for type inference
          R['request']['body']['content'][keyof R['request']['body']['content']]['schema'] extends ZodSchema<any>
          ? {
              in: {
                json: z.input<R['request']['body']['content'][keyof R['request']['body']['content']]['schema']>;
              };
              out: {
                json: z.output<R['request']['body']['content'][keyof R['request']['body']['content']]['schema']>;
              };
            }
          : // biome-ignore lint/complexity/noBannedTypes: required for type inference
            {}
      : // biome-ignore lint/complexity/noBannedTypes: required for type inference
        {}
    : // biome-ignore lint/complexity/noBannedTypes: required for type inference
      {}
  : // biome-ignore lint/complexity/noBannedTypes: required for type inference
    {};

type HandlerTypedResponse<O> = TypedResponse<O> | Promise<TypedResponse<O>>;
type HandlerAllResponse<O> = Response | Promise<Response> | TypedResponse<O> | Promise<TypedResponse<O>>;

type OutputType<R extends RouteConfig['route']> = R['responses'] extends Record<infer _, infer C>
  ? C extends ResponseConfig
    ? C['content'] extends ZodContentObject
      ? IsJson<keyof C['content']> extends never
        ? // biome-ignore lint/complexity/noBannedTypes: required for type inference
          {}
        : C['content'][keyof C['content']]['schema'] extends ZodSchema
          ? z.infer<C['content'][keyof C['content']]['schema']>
          : // biome-ignore lint/complexity/noBannedTypes: required for type inference
            {}
      : // biome-ignore lint/complexity/noBannedTypes: required for type inference
        {}
    : // biome-ignore lint/complexity/noBannedTypes: required for type inference
      {}
  : // biome-ignore lint/complexity/noBannedTypes: required for type inference
    {};

const isNotPublicRoute = (guard: RouteConfig['guard']): guard is NonEmptyArray<MiddlewareHandler> => {
  return !guard.includes('public');
};

// biome-ignore lint/complexity/noBannedTypes: <explanation>
export class CustomHono<E extends Env = Env, S extends Schema = {}, BasePath extends string = '/'> extends OpenAPIHono<E, S, BasePath> {
  // override route<
  //   SubPath extends string,
  //   SubEnv extends Env,
  //   SubSchema extends Schema,
  //   SubBasePath extends string
  // >(
  //   path: SubPath,
  //   app: Hono<SubEnv, SubSchema, SubBasePath>
  // ): CustomHono<E, MergeSchemaPath<SubSchema, MergePath<BasePath, SubPath>> & S, BasePath>;
  // override route<SubPath extends string>(path: SubPath): Hono<E, RemoveBlankRecord<S>, BasePath>;
  // override route<
  //   SubPath extends string,
  //   SubEnv extends Env,
  //   SubSchema extends Schema,
  //   SubBasePath extends string
  // >(
  //   path: SubPath,
  //   app?: Hono<SubEnv, SubSchema, SubBasePath>
  // ): CustomHono<E, MergeSchemaPath<SubSchema, MergePath<BasePath, SubPath>> & S, BasePath> {
  //   if (!(app instanceof CustomHono)) {
  //     return this;
  //   }

  //   super.route(path, app);

  //   return this;
  // }

  public add<
    R extends RouteConfig['route'],
    I extends Input = InputTypeParam<R> & InputTypeQuery<R> & InputTypeHeader<R> & InputTypeCookie<R> & InputTypeJson<R>,
    P extends string = ConvertPathType<R['path']>,
  >(
    {
      route,
      guard,
      middlewares,
    }: {
      route: R;
      guard: RouteConfig['guard'];
      middlewares: RouteConfig['middlewares'];
    },
    handler: Handler<
      E,
      P,
      I,
      R extends {
        responses: {
          [statusCode: string]: {
            content: {
              [mediaType: string]: ZodMediaTypeObject;
            };
          };
        };
      }
        ? HandlerTypedResponse<OutputType<R>>
        : HandlerAllResponse<OutputType<R>>
    >,
  ): CustomHono<E, S & ToSchema<R['method'], P, I['in'], OutputType<R>>, '/'> {
    const handlers = [];

    if (isNotPublicRoute(guard)) {
      handlers.push(...guard);
    }

    if (middlewares && middlewares.length > 0) {
      handlers.push(...middlewares);
    }

    // add guards and middlewares
    this[route.method as 'get' | 'post' | 'put' | 'delete'](route.getRoutingPath(), ...handlers);

    this.openapi(route, handler);

    return this;
  }
}
