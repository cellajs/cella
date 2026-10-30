import { useSuspenseQuery } from '@tanstack/react-query';
import { Fragment, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GenOperationSummary } from 'sdk/docs-types';
import type { TKey } from '~/lib/i18n-locales';
import { extensionLabel } from '~/modules/docs/helpers/extension-label';
import { type AccessValue, ExplainedValue, explainedUnderline } from '~/modules/docs/operations/access-explanation';
import { infoQueryOptions } from '~/modules/docs/query';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { HelpCollapse, HelpToggleIcon } from '~/modules/ui/help-toggle';

/** The proof behind each security scheme the backend registers; an app's own scheme shows its name. */
const proofs: Record<string, { label: TKey; text: TKey }> = {
  cookieAuth: { label: 'c:session', text: 'c:docs.proof_session.text' },
  apiKey: { label: 'c:api_key', text: 'c:docs.proof_api_key.text' },
  oauth2: { label: 'c:access_token', text: 'c:docs.proof_access_token.text' },
};

const codeChip = (text: string) => <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">{text}</code>;

/** Writes the explanations out, for the bar that opens them all at once. */
function WrittenOut({ open, values }: { open: boolean; values: AccessValue[] }) {
  return (
    <HelpCollapse open={open}>
      {values.map(
        ({ value, name, description }) =>
          description && (
            <span key={value} className="block pt-1">
              {name}: {description}
            </span>
          ),
      )}
    </HelpCollapse>
  );
}

/** How an operation is called: the proofs it accepts, its middleware and its MCP tool. The bar opens every explanation at once. */
export function OperationAccess({ operation }: { operation: GenOperationSummary }) {
  const { t } = useTranslation();
  const [helpOpen, setHelpOpen] = useState(false);
  const { data: info } = useSuspenseQuery(infoQueryOptions);

  const security = operation.security ?? [];
  const schemes = security.flatMap((requirement) => Object.keys(requirement));
  const scopes = [...new Set(security.flatMap((requirement) => Object.values(requirement).flat()))];
  const middleware = info.extensions.filter((ext) => ext.kind === 'middleware' && operation.extensions[ext.id]?.length);
  const { tool } = operation;

  if (!schemes.length && !middleware.length && !tool) return null;

  const proofValues: AccessValue[] = schemes.map((scheme) => {
    const proof = proofs[scheme];
    return proof ? { value: scheme, code: scheme, name: t(proof.label), description: t(proof.text) } : { value: scheme, name: scheme };
  });
  const scopeText = t('c:docs.scope.text', { count: scopes.length });
  const toolValue: AccessValue | undefined = tool && {
    value: 'tool',
    name: t('c:docs.mcp_tool'),
    description: t('c:docs.tool_description.text', { description: tool.description }),
  };
  const approvalValue: AccessValue = { value: 'approval', name: t('c:docs.needs_approval'), description: t('c:docs.tool_approval.text') };

  return (
    <div className="mt-4">
      {/* Styled as the request and responses toggles, but its click opens the explanations: the rows stay in view */}
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={helpOpen}
        onClick={() => setHelpOpen(!helpOpen)}
        className="group/operation-access gap-2 aria-expanded:not-hover:bg-transparent"
      >
        <span>{t('c:access')}</span>
        <span className="sr-only">{t('c:help')}</span>
        <HelpToggleIcon open={helpOpen} className="opacity-40 group-hover/operation-access:opacity-70" />
      </Button>
      {/* A phone stacks each label over its value */}
      <dl className="mt-2 grid max-w-measure gap-x-4 gap-y-1 px-3 text-sm sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-y-2">
        {schemes.length > 0 && (
          <AccessRow label={t('c:docs.accepts')}>
            <div className="flex flex-wrap items-center gap-2">
              <ValueList values={proofValues} enabled={!helpOpen} />
              {scopes.map((scope) => (
                <ExplainedValue key={scope} item={{ value: scope, name: t('c:docs.scope'), description: scopeText }} enabled={!helpOpen}>
                  {codeChip(scope)}
                </ExplainedValue>
              ))}
            </div>
            <WrittenOut open={helpOpen} values={proofValues} />
            {scopes.length > 0 && (
              <HelpCollapse open={helpOpen}>
                <span className="block pt-1">{scopeText}</span>
              </HelpCollapse>
            )}
          </AccessRow>
        )}
        {middleware.map((ext) => {
          const values: AccessValue[] = operation.extensions[ext.id].map((value) => ({
            value,
            code: value,
            name: ext.values?.[value]?.name ?? value,
            description: ext.values?.[value]?.description,
            isGuard: ext.key === 'x-guard',
          }));
          return (
            <AccessRow key={ext.id} label={extensionLabel(ext)}>
              <ValueList values={values} enabled={!helpOpen} />
              <WrittenOut open={helpOpen} values={values} />
            </AccessRow>
          );
        })}
        {toolValue && tool && (
          <AccessRow label={t('c:docs.mcp_tool')}>
            <div className="flex flex-wrap items-center gap-2">
              <ExplainedValue item={toolValue} enabled={!helpOpen}>
                {codeChip(operation.id)}
              </ExplainedValue>
              {tool.approvalRequired && (
                <ExplainedValue item={approvalValue} enabled={!helpOpen}>
                  <Badge variant="outline" className="border-warning text-warning">
                    {approvalValue.name}
                  </Badge>
                </ExplainedValue>
              )}
            </div>
            <HelpCollapse open={helpOpen}>
              <span className="block pt-1">{toolValue.description}</span>
              {tool.approvalRequired && <span className="block pt-1">{approvalValue.description}</span>}
            </HelpCollapse>
          </AccessRow>
        )}
      </dl>
    </div>
  );
}

/** Comma-separated values, each opening its explanation. */
function ValueList({ values, enabled }: { values: AccessValue[]; enabled: boolean }) {
  return (
    <span>
      {values.map((item, index) => (
        <Fragment key={item.value}>
          {index > 0 && <span className="text-faint-foreground">, </span>}
          <ExplainedValue item={item} enabled={enabled} className={explainedUnderline}>
            {item.name}
          </ExplainedValue>
        </Fragment>
      ))}
    </span>
  );
}

function AccessRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground max-sm:not-first:pt-2">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}
