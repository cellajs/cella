import { Suspense } from 'react';
import type { ChannelEntityType } from 'shared';
import { AsideAnchor } from '~/modules/common/aside-anchor';
import { PageAside } from '~/modules/common/page/aside';
import { type ChannelSettingsHost, useChannelSettingsSections } from '~/modules/entities/use-channel-settings-sections';

interface ChannelSettingsPageProps<C extends ChannelEntityType> {
  entity: ChannelSettingsHost<C>;
}

/**
 * Page-hosted consumer for a channel entity's `settings` slot: an aside index next to the
 * anchored section stack. Section resolution (arrangement, grant and context-role gating) lives
 * in {@link useChannelSettingsSections}; this component only decides presentation, so apps
 * needing a different layout write their own map over the same sections.
 */
export function ChannelSettingsPage<C extends ChannelEntityType>({ entity }: ChannelSettingsPageProps<C>) {
  const sections = useChannelSettingsSections(entity);

  return (
    <div className="container mx-auto my-4 gap-4 md:flex md:flex-row">
      <div className="mx-auto flex h-auto flex-col max-md:hidden md:w-[30%] md:min-w-48">
        <div className="max-md:block! sticky top-15 z-10 max-h-[calc(100dvh-3.75rem)] overflow-y-auto p-1 md:mt-2">
          <PageAside tabs={sections} className="pb-2" />
        </div>
      </div>

      <div className="flex flex-col gap-8 md:w-[70%]">
        {sections.map((tool) => (
          <AsideAnchor key={tool.id} id={tool.id} extraOffset>
            <Suspense fallback={null}>{tool.render(entity)}</Suspense>
          </AsideAnchor>
        ))}
      </div>
    </div>
  );
}
