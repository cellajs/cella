import type { ContextEntity, Entity } from 'config';
import type { AppCustomEventMap } from '~/types/app';
import type { Membership } from '~/types/common';

export type CombinedCustomEventMap = AppCustomEventMap & {
  toggleCarouselDrag: CustomEvent<boolean>;
  updateEntityCover: CustomEvent<{ bannerUrl: string; entity: Entity }>;
  //  event  to manipulate data that has been changed in the menu
  menuEntityChange: CustomEvent<{ membership: Membership; entity: ContextEntity }>;
};

export type CustomEventsWithData = {
  [K in keyof CombinedCustomEventMap as CombinedCustomEventMap[K] extends CustomEvent<infer DetailData>
    ? IfAny<DetailData, never, K>
    : never]: CombinedCustomEventMap[K] extends CustomEvent<infer DetailData> ? DetailData : never;
};

type IfAny<T, Y, N> = 0 extends 1 & T ? Y : N;
