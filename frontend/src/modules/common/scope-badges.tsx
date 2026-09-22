import { useTranslation } from 'react-i18next';
import { Badge } from '~/modules/ui/badge';

type Translate = ReturnType<typeof useTranslation>['t'];
/** The entity plural key is built at runtime, which the typed key union cannot express. */
type LooseTranslate = (key: string, options?: Record<string, string>) => string;

/** `<entity>:<read|write>` as a label built from the entity's plural, so app entity types need no extra keys. */
export function scopeLabel(t: Translate, scope: string): string {
  const [entity, verb] = scope.split(':');
  const translate = t as unknown as LooseTranslate;
  const resource = translate(`c:${entity}_other`, { defaultValue: entity });
  return translate(verb === 'read' ? 'c:scope_read' : 'c:scope_write', { resource: resource.toLowerCase() });
}

/** The scopes of a token or consent, as the consent screen and the account page show them. */
export function ScopeBadges({ scopes, withLabels = false }: { scopes: string[]; withLabels?: boolean }) {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-wrap items-center gap-1">
      {scopes.map((scope) => (
        <li key={scope} className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono text-xs">
            {scope}
          </Badge>
          {withLabels && <span className="text-sm">{scopeLabel(t, scope)}</span>}
        </li>
      ))}
    </ul>
  );
}
