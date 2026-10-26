import { Suspense } from 'react';
import { getTools, resolvePlacementList } from '~/lib/placements';
import { AsideAnchor } from '~/modules/common/aside-anchor';
import { PageAside } from '~/modules/common/page/aside';
import { SimpleHeader } from '~/modules/common/simple-header';
import { StickyBox } from '~/modules/common/sticky-box';
import { useCurrentUser } from '~/modules/user/user-store';

const slot = 'account.settings';

/** The account settings page: the `account.settings` slot's tools as sections, with an aside that jumps between them. */
export function AccountPage() {
  const user = useCurrentUser();

  const sections = resolvePlacementList(slot, getTools(slot));

  return (
    <div className="container my-4 gap-4 md:mt-8 md:flex">
      <div className="max-md:hidden md:mt-2 md:w-3/10 md:min-w-48">
        <StickyBox offsetTop={12} className="group/sticky z-10 max-h-[calc(100dvh-1.5rem)] overflow-y-auto px-1">
          <SimpleHeader className="p-3" heading="c:account_settings" text="c:account_settings.text" collapseText />
          <PageAside tabs={sections} className="py-2" autoFocus />
        </StickyBox>
      </div>

      <div className="flex flex-col gap-8 md:w-7/10">
        {sections.map((tool) => (
          <AsideAnchor key={tool.id} id={tool.id}>
            <Suspense fallback={null}>{tool.render(user)}</Suspense>
          </AsideAnchor>
        ))}
      </div>
    </div>
  );
}
