import type { ChangeMessage, ShapeStreamOptions } from '@electric-sql/client';
import { config } from 'config';
import type { Attachment } from '~/modules/attachments/types';

// Convert camelCase to snake_case
type CamelToSnake<S extends string> = S extends `${infer First}${infer Rest}`
  ? `${Lowercase<First>}${Rest extends Uncapitalize<Rest> ? '' : '_'}${CamelToSnake<Rest>}`
  : S;

// Convert all object keys from camelCase to snake_case
type CamelToSnakeObject<T> = {
  [K in keyof T as CamelToSnake<string & K>]: T[K];
};

// Convert Attachment type to RawAttachment with snake_case keys
export type RawAttachment = CamelToSnakeObject<Attachment>;

// Configures ShapeStream options for real-time syncing of attachments
export const attachmentShape = (organizationId: string): ShapeStreamOptions => ({
  url: new URL(`/${organizationId}/attachments/shape-proxy`, config.backendUrl).href,
  params: { where: `organization_id = '${organizationId}'` },
  backoffOptions: {
    initialDelay: 500,
    maxDelay: 32000,
    multiplier: 2,
  },
  fetchClient: (input, init) =>
    fetch(input, {
      ...init,
      credentials: 'include',
    }),
});

export const convertMessageIntoAttachments = (messages: ChangeMessage<RawAttachment>[], action: 'insert' | 'update' | 'delete') => {
  const filteredMessages = messages.filter((m) => m.headers.operation === action);
  return filteredMessages.map((message) => parseRawAttachment(message.value));
};

// Parses raw attachment data into the Attachment type
const parseRawAttachment = (rawAttachment: RawAttachment): Attachment => {
  const attachment = {} as Attachment;
  for (const key of Object.keys(rawAttachment) as (keyof RawAttachment)[]) {
    const camelKey = snakeToCamel(key) as keyof Attachment;
    attachment[camelKey] = rawAttachment[key] as never;
  }
  return attachment;
};

const snakeToCamel = (str: string) => str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
