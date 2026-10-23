import { Suspense } from 'react';
import type { ChannelEntityType } from 'shared';
import { AsideAnchor } from '~/modules/common/aside-anchor';
import { PageAside } from '~/modules/common/page/aside';
import { type ChannelSettingsHost, useChannelSettingsSections } from '~/modules/entities/use-channel-settings-sections';

interface ChannelSettingsPageProps<C extends ChannelEntityType> {
  entity: ChannelSettingsHost<C>;
}

export function ChannelSettingsPage<C extends ChannelEntityType>({ entity }: ChannelSettingsPageProps<C>) {
  const sections = useChannelSettingsSections(entity);

  return (
    <div className="my-4 gap-4 md:flex">
      <div className="max-md:hidden md:w-3/10 md:min-w-48">
        <div className="sticky top-15 z-10 max-h-[calc(100dvh-3.75rem)] overflow-y-auto p-1 md:mt-2">
          <PageAside tabs={sections} className="pb-2" />
        </div>
      </div>

      <div className="flex flex-col gap-8 md:w-7/10">
        {sections.map((section) => (
          <AsideAnchor key={section.id} id={section.id} extraOffset>
            <Suspense fallback={null}>{section.render(entity)}</Suspense>
          </AsideAnchor>
        ))}
      </div>
    </div>
  );
}
