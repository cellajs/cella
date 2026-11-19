import { hierarchy } from 'shared';
import { ltiContextTypes } from '#/modules/lti-platform/launch-context';
import type { LtiResourceLinkModel } from '#/modules/lti-platform/lti-resource-links-db';

/**
 * The course a placement is in: its own channel when that is an LTI context, else its nearest ancestor that is, read
 * from the placement's channel id columns; null when none is (`ltiContextTypes`). A launch names it as its context, and
 * the installation reads its people.
 */
export const placementContext = (placement: LtiResourceLinkModel) => {
  const types = ltiContextTypes(placement.channelType);
  if (types) return { channelType: placement.channelType, channelId: placement.channelId, types };
  for (const ancestor of hierarchy.resolveNonNullAncestors(placement.channelType, placement)) {
    const ancestorTypes = ltiContextTypes(ancestor.type);
    if (ancestorTypes) return { channelType: ancestor.type, channelId: ancestor.id, types: ancestorTypes };
  }
  return null;
};

export type PlacementContext = NonNullable<ReturnType<typeof placementContext>>;
