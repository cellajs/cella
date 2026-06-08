import { useTranslation } from 'react-i18next';
import { useBreakpointAbove } from '~/hooks/use-breakpoints';
import { ExpandableList } from '~/modules/common/expandable-list';
import { features } from '~/modules/marketing/marketing-config';
import { useUIStore } from '~/modules/ui/ui-store';

export type InfoGridItem = {
  id: string;
};

interface InfoGridItemProps {
  id: string;
  invertClassName: string;
}

function InfoGridItem({ id, invertClassName }: InfoGridItemProps) {
  const { t } = useTranslation();
  const title = `about:feature.${id}_title`;
  const text = `about:feature.${id}_text`;

  return (
    <div className="relative overflow-hidden rounded-lg bg-card p-2">
      <div className="flex h-44 flex-col justify-between gap-2 rounded-md p-6">
        <img
          src={`/static/images/features/${id}.svg`}
          alt={title}
          className={`mb-2 h-8 w-8 object-contain ${invertClassName}`}
          loading="lazy"
        />
        <h3 className="font-medium">{t(title)}</h3>
        <p className="grow text-muted-foreground text-sm">{t(text)}</p>
      </div>
    </div>
  );
}

export function InfoGrid() {
  const mode = useUIStore((state) => state.mode);
  const invertClass = mode === 'dark' ? 'invert' : '';
  const isMediumScreen = useBreakpointAbove('md');

  return (
    <div className="mx-auto grid max-w-5xl justify-center gap-4 sm:grid-cols-2 md:grid-cols-3">
      <ExpandableList<InfoGridItem>
        items={features}
        renderItem={(feature) => <InfoGridItem key={feature.id} {...feature} invertClassName={invertClass} />}
        initialDisplayCount={4}
        alwaysShowAll={isMediumScreen}
        expandText="c:more_features"
      />
    </div>
  );
}
