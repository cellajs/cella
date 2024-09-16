import type { TasksCustomEventMap } from '~/modules/tasks/types';
import type { Entity } from '~/types/common';

export type CombinedCustomEventMap = TasksCustomEventMap & {
  updateEntityCover: CustomEvent<{ bannerUrl: string; entity: Entity }>;
};

export type CustomEventsWithData = {
  [K in keyof CombinedCustomEventMap as CombinedCustomEventMap[K] extends CustomEvent<infer DetailData>
    ? IfAny<DetailData, never, K>
    : never]: CombinedCustomEventMap[K] extends CustomEvent<infer DetailData> ? DetailData : never;
};

type IfAny<T, Y, N> = 0 extends 1 & T ? Y : N;
