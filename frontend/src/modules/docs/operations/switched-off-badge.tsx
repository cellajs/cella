import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { type ConfigSwitch, isSwitchOn } from 'shared';
import { Badge } from '~/modules/ui/badge';
import { cn } from '~/utils/cn';

/** An operation whose config switch is off in this app: the API refuses it, the docs still list it. */
export const isSwitchedOff = (enabledBy?: ConfigSwitch) => !!enabledBy && !isSwitchOn(enabledBy);

/** Marks an operation whose config switch is off. */
export function SwitchedOffBadge({ enabledBy, className }: { enabledBy?: ConfigSwitch; className?: string }) {
  const { t } = useTranslation();
  if (!isSwitchedOff(enabledBy)) return null;

  return (
    <Badge variant="outline" className={cn('text-muted-foreground', className)}>
      {t('c:docs.switched_off')}
    </Badge>
  );
}

/** The name or path of an operation a reader cannot call: switched off, or deprecated in search. */
export function StruckText({ struck, children }: { struck?: boolean; children: ReactNode }) {
  return <span className={cn(struck && 'text-muted-foreground line-through')}>{children}</span>;
}
