import { Suspense } from 'react';
import type { UserBase } from 'sdk';
import { getTools, resolvePlacementList } from '~/lib/placements';

const slot = 'user.profile';

interface Props {
  user: UserBase;
  organizationId?: string;
  isSheet?: boolean;
}

/**
 * Profile page body below the header: hosts the `user.profile` slot, so apps add or replace profile
 * surfaces from their module config without patching this file. Cella's organization module
 * contributes the organizations grid. The page does not wrap this: each tool owns its container
 * (so it can run full width) and its top padding.
 */
export function UserProfileContent({ user, organizationId, isSheet = false }: Props) {
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
