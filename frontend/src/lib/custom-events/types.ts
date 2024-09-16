import type { ContextEntity, Entity, Membership } from '~/types/common';

// Add to CombinedCustomEventMap events that you create in your own app
export type CombinedCustomEventMap = {
  updateEntityCover: CustomEvent<{ bannerUrl: string; entity: Entity }>;
  entityArchiveToggle: CustomEvent<{ membership: Membership; entity: ContextEntity }>;
  entityMuteToggle: CustomEvent<{ membership: Membership; entity: ContextEntity }>;
};

export type CustomEventsWithData = {
  [K in keyof CombinedCustomEventMap as CombinedCustomEventMap[K] extends CustomEvent<infer DetailData>
    ? IfAny<DetailData, never, K>
    : never]: CombinedCustomEventMap[K] extends CustomEvent<infer DetailData> ? DetailData : never;
};

type IfAny<T, Y, N> = 0 extends 1 & T ? Y : N;
