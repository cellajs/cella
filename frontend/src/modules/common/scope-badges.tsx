import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { Badge } from '~/modules/ui/badge';

interface ScopeBadgesProps {
  scopes: string[];
  withLabels?: boolean;
}

/** The scopes of a token or consent, as the consent screen and the account page show them. */
export function ScopeBadges({ scopes, withLabels = false }: ScopeBadgesProps) {
  const { t } = useTranslation();

  // `<entity>:<read|write>` as a label built from the entity's plural, so app entity types need no extra keys
  const scopeLabel = (scope: string) => {
    const [entity, verb] = scope.split(':');
    // The plural key is built at runtime, which the typed key union cannot express
    const resource = t(`c:${entity}_other` as TKey, { defaultValue: entity });
    return t(verb === 'read' ? 'c:scope_read' : 'c:scope_write', { resource });
  };

  return (
    <ul className="flex flex-wrap items-center gap-1">
      {scopes.map((scope) => (
        <li key={scope} className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono">
            {scope}
          </Badge>
          {withLabels && <span className="text-sm">{scopeLabel(scope)}</span>}
        </li>
      ))}
    </ul>
  );
}
