import { z } from 'zod';
import { errorResponses, successWithDataSchema, successWithoutDataSchema, successWithPaginationSchema } from '../../lib/common-responses';
import { idsQuerySchema } from '../../lib/common-schemas';

import { createRouteConfig } from '../../lib/route-config';
import { isAuthenticated } from '../../middlewares/guard';

import {
  getTasksQuerySchema,
  simpleTaskSchema,
  createTaskSchema,
  idParamSchema,
  updateTaskSchema,
  relativeQuerySchema,
  fullTaskSchema,
  getNewOrderQuerySchema,
} from './schema';

class TaskRoutesConfig {
  public createTask = createRouteConfig({
    method: 'post',
    path: '/',
    guard: [isAuthenticated],
    tags: ['tasks'],
    summary: 'Create new task',
    description: 'Create a new task in an project.',
    request: {
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
    description: 'Get list of tasks that in requested projects.',
    request: {
      query: getTasksQuerySchema,
    },
    responses: {
      200: {
        description: 'Task',
        content: {
          'application/json': {
            schema: successWithPaginationSchema(fullTaskSchema),
          },
        },
        ...errorResponses,
      },
    },
  });

  public getNewTaskOrder = createRouteConfig({
    method: 'get',
    path: '/new-order',
    guard: [isAuthenticated],
    tags: ['tasks'],
    summary: 'Get new order',
    description: 'Get new task order on status change ',
    request: {
      query: getNewOrderQuerySchema,
    },
    responses: {
      200: {
        description: 'Task',
        content: {
          'application/json': {
            schema: successWithDataSchema(z.number()),
          },
        },
        ...errorResponses,
      },
    },
  });

  public getTask = createRouteConfig({
    method: 'get',
    path: '/{id}',
    guard: [isAuthenticated],
    tags: ['tasks'],
    summary: 'Get tasks',
    description: 'Get tasks by id.',
    request: {
      params: idParamSchema,
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

  public getRelativeTaskOrder = createRouteConfig({
    method: 'post',
    path: '/relative',
    guard: [isAuthenticated],
    tags: ['tasks'],
    summary: 'Get relative task',
    description: 'Get relative task by main task order position and edge of trigger',
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: relativeQuerySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Task',
        content: {
          'application/json': {
            schema: successWithDataSchema(z.number()),
          },
        },
      },
      ...errorResponses,
    },
  });

  public updateTask = createRouteConfig({
    method: 'put',
    path: '/{id}',
    guard: [isAuthenticated],
    tags: ['tasks'],
    summary: 'Update Task',
    description: 'Update Task by id.',
    request: {
      params: idParamSchema,
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
