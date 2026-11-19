import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { Badge } from '~/modules/ui/badge';

/** `<entity>:<read|write>` as a label built from the entity's plural: an app's own entity types need no keys of their own. */
export const scopeLabel = (t: TFunction, scope: string) => {
  const [entity, verb] = scope.split(':');
  // The plural key is built at runtime, which the typed key union cannot express
  const resource = t(`c:${entity}_other` as TKey, { defaultValue: entity });
  return t(verb === 'read' ? 'c:scope_read' : 'c:scope_write', { resource });
};

/** The scopes of a token or consent, as the consent screen and the account page show them. */
export function ScopeBadges({ scopes, withLabels }: { scopes: string[]; withLabels?: boolean }) {
  const { t } = useTranslation();

  return (
    <ul className="flex flex-wrap items-center gap-1">
      {scopes.map((scope) => (
        <li key={scope} className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono">
            {scope}
          </Badge>
          {withLabels && <span className="text-sm">{scopeLabel(t, scope)}</span>}
        </li>
      ))}
    </ul>
  );
}
