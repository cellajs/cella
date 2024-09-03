import { errorResponses, successWithDataSchema, successWithPaginationSchema, successWithoutDataSchema } from '#/lib/common-responses';
import { idsQuerySchema, productParamSchema } from '#/lib/common-schemas';

import { createRouteConfig } from '#/lib/route-config';
import { isAuthenticated } from '#/middlewares/guard';

import { getLabelsQuerySchema, labelSchema, updateLabelSchema } from './schema';

class LabelsRoutesConfig {
  public createLabel = createRouteConfig({
    method: 'post',
    path: '/',
    guard: [isAuthenticated],
    tags: ['labels'],
    summary: 'Create new label',
    description: 'Create a new label with project bound.',
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: labelSchema,
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
    guard: [isAuthenticated],
    tags: ['labels'],
    summary: 'Get list of labels',
    description: 'Get list of labels in a project.',
    request: {
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
    guard: [isAuthenticated],
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
    guard: [isAuthenticated],
    tags: ['labels'],
    summary: 'Delete labels',
    description: 'Delete labels by ids.',
    request: {
      query: idsQuerySchema,
    },
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  });
}
export default new LabelsRoutesConfig();
