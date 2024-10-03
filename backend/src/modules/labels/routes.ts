import {
  errorResponses,
  successWithDataSchema,
  successWithErrorsSchema,
  successWithPaginationSchema,
  successWithoutDataSchema,
} from '#/utils/schema/common-responses';
import { idOrSlugSchema, idsQuerySchema, productParamSchema } from '#/utils/schema/common-schemas';

import { createRouteConfig } from '#/lib/route-config';
import { hasOrgAccess, isAuthenticated } from '#/middlewares/guard';

import { z } from 'zod';
import { createLabelSchema, getLabelsQuerySchema, labelSchema, updateLabelSchema } from './schema';

class LabelsRoutesConfig {
  public createLabel = createRouteConfig({
    method: 'post',
    path: '/',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['labels'],
    summary: 'Create new label',
    description: 'Create a new label with project bound.',
    request: {
      params: z.object({ orgIdOrSlug: idOrSlugSchema }),
      body: {
        required: true,
        content: {
          'application/json': {
            schema: createLabelSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Label created',
        content: {
          'application/json': {
            schema: successWithDataSchema(labelSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public getLabels = createRouteConfig({
    method: 'get',
    path: '/',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['labels'],
    summary: 'Get list of labels',
    description: 'Get list of labels in a project.',
    request: {
      params: z.object({ orgIdOrSlug: idOrSlugSchema }),
      query: getLabelsQuerySchema,
    },
    responses: {
      200: {
        description: 'Label list',
        content: {
          'application/json': {
            schema: successWithPaginationSchema(labelSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public updateLabel = createRouteConfig({
    method: 'put',
    path: '/{id}',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['labels'],
    summary: 'Update label',
    description: 'Update label by id.',
    request: {
      params: productParamSchema,
      body: {
        content: {
          'application/json': {
            schema: updateLabelSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Label updated',
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  });

  public deleteLabels = createRouteConfig({
    method: 'delete',
    path: '/',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['labels'],
    summary: 'Delete labels',
    description: 'Delete labels by ids.',
    request: {
      params: z.object({ orgIdOrSlug: idOrSlugSchema }),
      query: idsQuerySchema,
    },
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: successWithErrorsSchema(),
          },
        },
      },
      ...errorResponses,
    },
  });
}
export default new LabelsRoutesConfig();
