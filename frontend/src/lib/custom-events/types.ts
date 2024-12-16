import type { AppCustomEventMap } from '~/types/app';
import type { Entity } from '~/types/common';

export type CombinedCustomEventMap = AppCustomEventMap & {
  toggleCarouselDrag: CustomEvent<boolean>;
  updateEntityCover: CustomEvent<{ bannerUrl: string; entity: Entity }>;
};

export type CustomEventsWithData = {
  [K in keyof CombinedCustomEventMap as CombinedCustomEventMap[K] extends CustomEvent<infer DetailData>
    ? IfAny<DetailData, never, K>
    : never]: CombinedCustomEventMap[K] extends CustomEvent<infer DetailData> ? DetailData : never;
};

type IfAny<T, Y, N> = 0 extends 1 & T ? Y : N;
