import { Suspense } from 'react';
import { getTools, resolvePlacementList } from '~/lib/placements';
import { AsideAnchor } from '~/modules/common/aside-anchor';
import { PageAside } from '~/modules/common/page/aside';
import { SimpleHeader } from '~/modules/common/simple-header';
import { useCurrentUser } from '~/modules/user/user-store';

const slot = 'account.settings';

/** Hosts the `account.settings` slot: sections come from the tool registry, with no grants or context-role pairs. */
function UserAccountPage() {
  const user = useCurrentUser();

  const sections = resolvePlacementList(slot, getTools('account.settings'));

  return (
    <div className="container my-4 gap-4 md:mt-8 md:flex md:flex-row">
      <div className="mx-auto max-md:hidden md:mt-3 md:w-[30%] md:min-w-48">
        <div className="max-md:block! group sticky top-3 z-10 max-h-[calc(100dvh-1.5rem)] overflow-y-auto px-1">
          <SimpleHeader className="p-3" heading="c:settings" text="c:settings.text" collapseText />
          <PageAside tabs={sections} className="py-2" setFocus />
        </div>
      </div>

      <div className="flex flex-col gap-8 md:w-[70%]">
        {sections.map((tool) => (
          <AsideAnchor key={tool.id} id={tool.id}>
            <Suspense fallback={null}>{tool.render(user)}</Suspense>
          </AsideAnchor>
        ))}
      </div>
    </div>
  );
}

export { UserAccountPage };
