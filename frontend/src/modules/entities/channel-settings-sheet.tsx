import { Suspense } from 'react';
import type { ChannelEntityType } from 'shared';
import { type ChannelSettingsHost, useChannelSettingsSections } from '~/modules/entities/use-channel-settings-sections';

interface ChannelSettingsSheetProps<C extends ChannelEntityType> {
  entity: ChannelSettingsHost<C>;
}

export function ChannelSettingsSheet<C extends ChannelEntityType>({ entity }: ChannelSettingsSheetProps<C>) {
  const sections = useChannelSettingsSections(entity);

  return (
    <div className="mb-12 flex flex-col gap-8">
      {sections.map((tool) => (
        <Suspense key={tool.id} fallback={null}>
          {tool.render(entity)}
        </Suspense>
      ))}
    </div>
  );
}
