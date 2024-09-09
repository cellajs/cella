import type { Entity } from '~/types/common';

export interface CustomEventMap {
  updateCover: CustomEvent<{ bannerUrl: string; entity: Entity }>;
}

export type CustomEventsWithData = {
  [K in keyof CustomEventMap as CustomEventMap[K] extends CustomEvent<infer DetailData>
    ? IfAny<DetailData, never, K>
    : never]: CustomEventMap[K] extends CustomEvent<infer DetailData> ? DetailData : never;
};

type IfAny<T, Y, N> = 0 extends 1 & T ? Y : N;
