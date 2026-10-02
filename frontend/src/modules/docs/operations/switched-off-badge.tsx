import { useTranslation } from 'react-i18next';
import type { GenOperationSummary } from 'sdk/docs-types';
import { type ConfigSwitch, isSwitchOn } from 'shared';
import { Badge } from '~/modules/ui/badge';

/** Whether the operation's config switch is off in this app: the API refuses it, the docs still list it. */
export const isSwitchedOff = ({ enabledBy }: GenOperationSummary) => !!enabledBy && !isSwitchOn(enabledBy);

interface SwitchedOffBadgeProps {
  enabledBy?: ConfigSwitch;
  /** Spells out the reason beside the badge; without it, the reason is the badge's tooltip. */
  withReason?: boolean;
}

/** Marks an operation whose config switch is off in this app, naming the service, sign-in method or provider. */
export function SwitchedOffBadge({ enabledBy, withReason }: SwitchedOffBadgeProps) {
  const { t } = useTranslation();
  if (!enabledBy || isSwitchOn(enabledBy)) return null;

  const reason =
    'service' in enabledBy
      ? t('c:docs.switched_off_service', { name: enabledBy.service })
      : t('c:docs.switched_off_strategy', { name: enabledBy.provider ?? enabledBy.strategy });

  return (
    <>
      <Badge
        variant="outline"
        className="shrink-0 text-muted-foreground"
        data-tooltip={withReason ? undefined : 'true'}
        data-tooltip-content={withReason ? undefined : reason}
      >
        {t('c:docs.switched_off')}
      </Badge>
      {withReason && <span className="text-muted-foreground text-sm">{reason}</span>}
    </>
  );
}
