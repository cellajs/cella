import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBreakpointAbove } from '~/hooks/use-breakpoints';
import { ExpandableList } from '~/modules/common/expandable-list';
import { Badge } from '~/modules/ui/badge';
import { useUIStore } from '~/modules/ui/ui-store';

export type InfoGridItem<C extends string = string> = {
  id: string;
  /** Category used for grouping when `categoryIcons` is provided. */
  category?: C;
  /** Stack layers rendered as badges after the title. */
  layers?: readonly string[];
};

interface InfoTileProps {
  id: string;
  namespace: string;
  layers?: readonly string[];
  image?: boolean;
  invertClassName?: string;
}

function InfoTile({ id, namespace, layers, image, invertClassName }: InfoTileProps) {
  const { t } = useTranslation();
  const title = `about:${namespace}.${id}`;
  const text = `about:${namespace}.${id}.text`;

  if (image) {
    return (
      <div className="relative overflow-hidden rounded-lg bg-card p-2">
        <div className="flex h-44 flex-col justify-between gap-2 rounded-md p-6">
          <img
            src={`/static/images/features/${id}.svg`}
            alt={t(title)}
            className={`mb-2 h-8 w-8 object-contain ${invertClassName ?? ''}`}
            loading="lazy"
          />
          <h3 className="font-medium">{t(title)}</h3>
          <p className="grow text-muted-foreground text-sm">{t(text)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-card p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{t(title)}</h3>
        {layers?.map((layer) => (
          <Badge key={layer} variant="brand" soft size="micro">
            {layer}
          </Badge>
        ))}
      </div>
      <p className="mt-2 text-muted-foreground text-sm">{t(text)}</p>
    </div>
  );
}

interface InfoGridProps<C extends string> {
  /** Items to render, each optionally tagged with a category and stack layers. */
  items: InfoGridItem<C>[];
  /** Translation namespace, e.g. `about:<namespace>.<id>`. */
  namespace?: string;
  /** Icon per category. When set, items are grouped by category with a header. */
  categoryIcons?: Record<C, LucideIcon>;
  /** Hide the per-category icon + title headers (e.g. when a parent section already provides one). */
  hideCategoryHeader?: boolean;
  /** Render an SVG image icon per tile (from `/static/images/features/<id>.svg`). */
  image?: boolean;
  /** Wrap a flat (ungrouped) grid in an expandable list. Ignored when grouping by category. */
  expandable?: boolean;
  /** Grid column classes for the flat (ungrouped) layout. */
  className?: string;
}

export function InfoGrid<C extends string>({
  items,
  namespace = 'features',
  categoryIcons,
  hideCategoryHeader,
  image,
  expandable,
  className = 'sm:grid-cols-2 md:grid-cols-3',
}: InfoGridProps<C>) {
  const { t } = useTranslation();
  const mode = useUIStore((state) => state.mode);
  const invertClass = mode === 'dark' ? 'invert' : '';
  const isMediumScreen = useBreakpointAbove('md');

  const renderTile = (item: InfoGridItem<C>) => (
    <InfoTile
      key={item.id}
      id={item.id}
      namespace={namespace}
      layers={item.layers}
      image={image}
      invertClassName={invertClass}
    />
  );

  // Grouped layout: one section per category with an icon + title header.
  if (categoryIcons) {
    const categories = items.reduce<C[]>((acc, item) => {
      if (item.category && !acc.includes(item.category)) acc.push(item.category);
      return acc;
    }, []);

    return (
      <div className="space-y-16">
        {categories.map((category) => {
          const CategoryIcon: LucideIcon = categoryIcons[category];
          return (
            <div key={category}>
              {!hideCategoryHeader && (
                <h2 className="mb-6 flex items-center gap-2 pl-6 font-semibold text-xl">
                  <CategoryIcon className="size-5 text-muted-foreground" />
                  {t(`about:${namespace}.category_${category}`)}
                </h2>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                {items.filter((item) => item.category === category).map(renderTile)}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Flat layout, optionally expandable.
  return (
    <div className={`mx-auto grid max-w-5xl justify-center gap-4 ${className}`}>
      {expandable ? (
        <ExpandableList<InfoGridItem<C>>
          items={items}
          renderItem={renderTile}
          initialDisplayCount={4}
          alwaysShowAll={isMediumScreen}
          expandText="c:more"
        />
      ) : (
        items.map(renderTile)
      )}
    </div>
  );
}
