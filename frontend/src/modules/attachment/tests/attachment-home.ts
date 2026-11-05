import { hierarchy } from 'shared';

/**
 * The id columns of the channels an app requires an attachment to live in below the organization, and the home its rows
 * splice into: a create body is parsed before it is sent. None in the template, whose rows live in the organization.
 * Kept out of test-setup.ts: `vi.mock('shared')` factories import that file, and this one imports `shared`.
 */
export const requiredAttachmentHome = (organizationId: string) => {
  const nullable = hierarchy.getNullableAncestors('attachment');
  const columns = Object.fromEntries(
    hierarchy
      .getOrderedAncestors('attachment')
      .filter((type) => type !== 'organization' && !nullable.includes(type))
      .map((type, index) => [hierarchy.idColumnKeys[type], `01970000-0000-7000-8000-0000000001${String(index).padStart(2, '0')}`]),
  );
  return { columns, homeChannelId: hierarchy.resolveDeepestAncestorId('attachment', { organizationId, ...columns }) ?? undefined };
};
