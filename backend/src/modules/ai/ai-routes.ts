import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/core/x-routes';
import { authGuard, orgGuard, tenantGuard } from '#/middlewares/guard';
import {
  chatCreateBodySchema,
  chatListQuerySchema,
  chatSchema,
  chatUpdateBodySchema,
  messageCreateBodySchema,
  messageListQuerySchema,
  messageSchema,
} from '#/modules/ai/ai-schema';
import {
  batchResponseSchema,
  errorResponseRefs,
  idInTenantOrgParamSchema,
  idsBodySchema,
  paginationSchema,
  tenantOrgParamSchema,
} from '#/schemas';

const aiRoutes = {
  createChat: createXRoute({
    operationId: 'createChat',
    method: 'post',
    path: '/',
    xGuard: [authGuard, tenantGuard, orgGuard],
    tags: ['ai', 'cella'],
    summary: 'Create chat',
    description:
      'Creates a new chat session with an initial user message. Returns an SSE stream with the assistant response.',
    request: {
      params: tenantOrgParamSchema,
      body: { required: true, content: { 'application/json': { schema: chatCreateBodySchema } } },
    },
    responses: {
      200: {
        description: 'SSE stream with assistant response',
        content: { 'text/event-stream': { schema: z.any() } },
      },
      ...errorResponseRefs,
    },
  }),

  getChats: createXRoute({
    operationId: 'getChats',
    method: 'get',
    path: '/',
    xGuard: [authGuard, tenantGuard, orgGuard],
    tags: ['ai', 'cella'],
    summary: 'Get chats',
    description: 'Returns a paginated list of chat sessions for the current user.',
    request: {
      params: tenantOrgParamSchema,
      query: chatListQuerySchema,
    },
    responses: {
      200: {
        description: 'Chats',
        content: { 'application/json': { schema: paginationSchema(chatSchema) } },
      },
      ...errorResponseRefs,
    },
  }),

  getMessages: createXRoute({
    operationId: 'getMessages',
    method: 'get',
    path: '/{id}/messages',
    xGuard: [authGuard, tenantGuard, orgGuard],
    tags: ['ai', 'cella'],
    summary: 'Get messages',
    description: 'Returns a paginated list of messages for a chat session.',
    request: {
      params: idInTenantOrgParamSchema,
      query: messageListQuerySchema,
    },
    responses: {
      200: {
        description: 'Messages',
        content: { 'application/json': { schema: paginationSchema(messageSchema) } },
      },
      ...errorResponseRefs,
    },
  }),

  sendMessage: createXRoute({
    operationId: 'sendMessage',
    method: 'post',
    path: '/{id}/messages',
    xGuard: [authGuard, tenantGuard, orgGuard],
    tags: ['ai', 'cella'],
    summary: 'Send message',
    description: 'Sends a user message and returns an SSE stream with the assistant response.',
    request: {
      params: idInTenantOrgParamSchema,
      body: { required: true, content: { 'application/json': { schema: messageCreateBodySchema } } },
    },
    responses: {
      200: {
        description: 'SSE stream with assistant response',
        content: { 'text/event-stream': { schema: z.any() } },
      },
      ...errorResponseRefs,
    },
  }),

  updateChat: createXRoute({
    operationId: 'updateChat',
    method: 'put',
    path: '/{id}',
    xGuard: [authGuard, tenantGuard, orgGuard],
    tags: ['ai', 'cella'],
    summary: 'Update chat',
    description: 'Updates a chat session (rename or archive).',
    request: {
      params: idInTenantOrgParamSchema,
      body: { required: true, content: { 'application/json': { schema: chatUpdateBodySchema } } },
    },
    responses: {
      200: {
        description: 'Chat updated',
        content: { 'application/json': { schema: chatSchema } },
      },
      ...errorResponseRefs,
    },
  }),

  deleteChats: createXRoute({
    operationId: 'deleteChats',
    method: 'delete',
    path: '/',
    xGuard: [authGuard, tenantGuard, orgGuard],
    tags: ['ai', 'cella'],
    summary: 'Delete chats',
    description: 'Deletes one or more chat sessions and their messages.',
    request: {
      params: tenantOrgParamSchema,
      body: { content: { 'application/json': { schema: idsBodySchema() } } },
    },
    responses: {
      200: {
        description: 'Success',
        content: { 'application/json': { schema: batchResponseSchema() } },
      },
      ...errorResponseRefs,
    },
  }),
};

export default aiRoutes;
