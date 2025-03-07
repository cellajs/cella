import type { ChangeMessage } from '@electric-sql/client';

// Convert camelCase to snake_case
type CamelToSnake<S extends string> = S extends `${infer First}${infer Rest}`
  ? `${Lowercase<First>}${Rest extends Uncapitalize<Rest> ? '' : '_'}${CamelToSnake<Rest>}`
  : S;

// Convert all object keys from camelCase to snake_case
export type CamelToSnakeObject<T> = {
  [K in keyof T as CamelToSnake<Extract<K, string>>]: T[K];
};

export const convertMessageInfo = <T>(messages: ChangeMessage<CamelToSnakeObject<T>>[], action: 'insert' | 'update' | 'delete') => {
  const filteredMessages = messages.filter((m) => m.headers.operation === action);
  return filteredMessages.map((message) => parseRawAData(message.value));
};

// Parses raw  data into passed type
const parseRawAData = <T>(rawData: CamelToSnakeObject<T>): T => {
  const attachment = {} as T;
  for (const key of Object.keys(rawData)) {
    const camelKey = snakeToCamel(key) as keyof T;
    attachment[camelKey] = rawData[key as keyof CamelToSnakeObject<T>] as never;
  }
  return attachment;
};

export const snakeToCamel = (str: string) => str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
