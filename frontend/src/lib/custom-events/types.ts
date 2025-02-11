import type { ContextEntity, Entity } from 'config';
import type { AppCustomEventMap } from '~/lib/custom-events/app-types';
import type { Membership } from '~/modules/memberships/types';

export type CombinedCustomEventMap = AppCustomEventMap & {
  toggleCarouselDrag: CustomEvent<boolean>;
  updateEntityCover: CustomEvent<{ bannerUrl: string; entity: Entity }>;
  // Event to manipulate data that has been changed in the menu
  menuEntityChange: CustomEvent<{ membership: Membership; entity: ContextEntity }>;
};

export type CustomEventsWithData = {
  [K in keyof CombinedCustomEventMap as CombinedCustomEventMap[K] extends CustomEvent<infer DetailData>
    ? IfAny<DetailData, never, K>
    : never]: CombinedCustomEventMap[K] extends CustomEvent<infer DetailData> ? DetailData : never;
};

type IfAny<T, Y, N> = 0 extends 1 & T ? Y : N;
