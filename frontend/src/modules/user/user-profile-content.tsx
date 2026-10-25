import { Suspense } from 'react';
import type { UserBase } from 'sdk';
import { getTools, resolvePlacementList } from '~/lib/placements';

const slot = 'user.profile';

interface UserProfileContentProps {
  user: UserBase;
  organizationId?: string;
  isSheet?: boolean;
}

/** Hosts the `user.profile` slot. */
export function UserProfileContent({ user, organizationId, isSheet = false }: UserProfileContentProps) {
  const tools = resolvePlacementList(slot, getTools(slot));

  return (
    <>
      {tools.map((tool) => (
        <Suspense key={tool.id} fallback={null}>
          {tool.render({ user, organizationId, isSheet })}
        </Suspense>
      ))}
    </>
  );
}
