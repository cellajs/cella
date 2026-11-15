import { hashSourceId } from './hash-source-id.ts';

/** The HLC string `millis:counter:sourceHash` the frontend, the backend and bench stamp a field with; the counter has at least four digits. */
export const formatHlc = (millis: number | bigint, counter: number | bigint, sourceId: string): string =>
  `${millis}:${String(counter).padStart(4, '0')}:${hashSourceId(sourceId)}`;
