import { errorResponses, successWithDataSchema, successWithPaginationSchema, successWithoutDataSchema } from '#/utils/schema/common-responses';
import { idOrSlugSchema, idsQuerySchema, productParamSchema } from '#/utils/schema/common-schemas';

import { createRouteConfig } from '#/lib/route-config';
import { isAllowedTo, isAuthenticated } from '#/middlewares/guard';

import { z } from 'zod';
import { createTaskSchema, fullTaskSchema, getTasksQuerySchema, simpleTaskSchema, updateTaskSchema } from './schema';

class TaskRoutesConfig {
  public createTask = createRouteConfig({
    method: 'post',
    path: '/',
    guard: [isAuthenticated, isAllowedTo('create', 'task')],
    tags: ['tasks'],
    summary: 'Create new task',
    description: 'Create a new task in a project.',
    request: {
      params: z.object({ orgIdOrSlug: idOrSlugSchema }),
      body: {
        required: true,
        content: {
          'application/json': {
            schema: createTaskSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Task',
        content: {
          'application/json': {
            schema: successWithDataSchema(fullTaskSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public getTasks = createRouteConfig({
    method: 'get',
    path: '/',
    guard: [isAuthenticated],
    tags: ['tasks'],
    summary: 'Get list of tasks',
    description: 'Get list of tasks for specific projects.',
    request: {
      params: z.object({ orgIdOrSlug: idOrSlugSchema }),
      query: getTasksQuerySchema,
    },
    responses: {
      200: {
        description: 'Tasks',
        content: {
          'application/json': {
            schema: successWithPaginationSchema(fullTaskSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public getTask = createRouteConfig({
    method: 'get',
    path: '/{id}',
    guard: [isAuthenticated, isAllowedTo('read', 'task')],
    tags: ['tasks'],
    summary: 'Get task',
    description: 'Get a task by id.',
    request: {
      params: productParamSchema,
    },
    responses: {
      200: {
        description: 'Task',
        content: {
          'application/json': {
            schema: successWithDataSchema(simpleTaskSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public updateTask = createRouteConfig({
    method: 'put',
    path: '/{id}',
    guard: [isAuthenticated, isAllowedTo('update', 'task')],
    tags: ['tasks'],
    summary: 'Update task',
    description: 'Update task by id.',
    request: {
      params: productParamSchema,
      body: {
        content: {
          'application/json': {
            schema: updateTaskSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Task updated',
        content: {
          'application/json': {
            schema: successWithDataSchema(fullTaskSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public deleteTasks = createRouteConfig({
    method: 'delete',
    path: '/',
    guard: [isAuthenticated],
    tags: ['tasks'],
    summary: 'Delete tasks',
    description: 'Delete tasks by ids.',
    request: {
      params: z.object({ orgIdOrSlug: idOrSlugSchema }),
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
export default new TaskRoutesConfig();
