import { ChevronDownIcon, MonitorIcon, SmartphoneIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import { cn } from '~/utils/cn';

interface DeviceTileProps {
  deviceType: 'desktop' | 'mobile';
  /** The first row: the device's name and its badges. */
  title: ReactNode;
  /** `DeviceTileDetail`s; below `lg` the expandable ones wait for the tile's More toggle. */
  details: ReactNode;
  action?: ReactNode;
}

/** A session or a passkey as a card. */
export function DeviceTile({ deviceType, title, details, action }: DeviceTileProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const DeviceIcon = deviceType === 'desktop' ? MonitorIcon : SmartphoneIcon;

  return (
    <Card className="group/tile py-0 transition-shadow focus-ring:has-[button:focus]:ring-2 sm:py-0" data-expanded={expanded}>
      <CardContent className="flex gap-2 p-2 sm:gap-3 sm:p-3 lg:items-center">
        <DeviceIcon
          className="size-4 shrink-0 max-sm:mt-0.5 sm:size-8"
          role="img"
          aria-label={t(deviceType === 'desktop' ? 'c:desktop' : 'c:mobile')}
        />
        <div className="flex w-full flex-col gap-1 overflow-hidden">
          {title}
          <div className="flex flex-wrap gap-x-2 gap-y-1 text-muted-foreground text-sm md:gap-x-5">
            {details}
            <Button
              variant="link"
              size="auto"
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
              className="ring-offset-0 transition-opacity focus-visible:opacity-100 focus-visible:ring-transparent group-hover/tile:opacity-100 sm:opacity-0 lg:hidden"
            >
              {expanded ? t('c:less') : t('c:more')}
              <ChevronDownIcon className={cn('size-3 transition-transform', expanded && 'rotate-180')} />
            </Button>
          </div>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}

interface DeviceTileDetailProps {
  /** Read before the value by assistive technology. */
  label: string;
  /** Hidden below `lg` until the tile is expanded. */
  expandable?: boolean;
  children: ReactNode;
}

export function DeviceTileDetail({ label, expandable, children }: DeviceTileDetailProps) {
  return (
    <p className={cn('truncate', expandable && 'hidden max-lg:group-data-[expanded=true]/tile:inline lg:inline')}>
      <span className="sr-only">{label}: </span>
      {children}
    </p>
  );
}
