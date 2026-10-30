import { useTranslation } from 'react-i18next';
import type { GenOperationSummary } from 'sdk/docs-types';
import { type ConfigSwitch, isSwitchOn } from 'shared';
import type { TKey } from '~/lib/i18n-locales';
import { Badge } from '~/modules/ui/badge';

/** Sign-in methods as a sentence names them. */
const strategyNames: Record<Extract<ConfigSwitch, { strategy: string }>['strategy'], TKey> = {
  magic: 'c:magic',
  passkey: 'c:passkey',
  totp: 'c:totp',
  oauth: 'c:docs.strategy_oauth',
  sso: 'c:docs.strategy_sso',
};

/** Spelled as the services' own names; an app's service shows its config key. */
const serviceNames: Record<string, string> = { oauth: 'OAuth', mcp: 'MCP', yjs: 'Yjs' };

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
      ? t('c:docs.switched_off_service', { name: serviceNames[enabledBy.service] ?? enabledBy.service })
      : enabledBy.provider
        ? t('c:docs.switched_off_provider', { name: t(`c:${enabledBy.provider}`) })
        : t('c:docs.switched_off_strategy', { name: t(strategyNames[enabledBy.strategy]) });

  return (
    <>
      <Badge
        variant="outline"
        className="text-muted-foreground"
        data-tooltip={withReason ? undefined : 'true'}
        data-tooltip-content={withReason ? undefined : reason}
      >
        {t('c:docs.switched_off')}
      </Badge>
      {withReason && <span className="text-muted-foreground text-sm">{reason}</span>}
    </>
  );
}
