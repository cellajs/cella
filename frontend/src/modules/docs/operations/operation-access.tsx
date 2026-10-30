import { useSuspenseQuery } from '@tanstack/react-query';
import { Fragment, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GenOperationSummary } from 'sdk/docs-types';
import type { TKey } from '~/lib/i18n-locales';
import { extensionLabel } from '~/modules/docs/helpers/extension-label';
import { infoQueryOptions } from '~/modules/docs/query';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { HelpCollapse, HelpToggleIcon } from '~/modules/ui/help-toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/modules/ui/tooltip';

/** The proof behind each security scheme the backend registers; an app's own scheme shows its name. */
const proofLabels: Record<string, TKey> = { cookieAuth: 'c:session', apiKey: 'c:api_key', oauth2: 'c:access_token' };

const codeChip = (text: string) => (
  <code key={text} className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
    {text}
  </code>
);

/** How an operation is called: the proofs it accepts, its middleware and its MCP tool. The bar opens every explanation at once. */
export function OperationAccess({ operation }: { operation: GenOperationSummary }) {
  const { t } = useTranslation();
  const [helpOpen, setHelpOpen] = useState(false);
  const { data: info } = useSuspenseQuery(infoQueryOptions);

  const security = operation.security ?? [];
  const proofs = security.flatMap((requirement) => Object.keys(requirement));
  const scopes = [...new Set(security.flatMap((requirement) => Object.values(requirement).flat()))];
  const middleware = info.extensions.filter((ext) => ext.kind === 'middleware' && operation.extensions[ext.id]?.length);
  const { tool } = operation;

  if (!proofs.length && !middleware.length && !tool) return null;

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
        {proofs.length > 0 && (
          <AccessRow label={t('c:docs.accepts')}>
            <div className="flex flex-wrap items-center gap-2">
              <ValueList values={proofs.map((proof) => ({ value: proof, name: proof in proofLabels ? t(proofLabels[proof]) : proof }))} />
              {scopes.map(codeChip)}
            </div>
            {scopes.length > 0 && (
              <HelpCollapse open={helpOpen}>
                <span className="block pt-1">{t('c:docs.scope.text', { count: scopes.length })}</span>
              </HelpCollapse>
            )}
          </AccessRow>
        )}
        {middleware.map((ext) => {
          const values = operation.extensions[ext.id].map((value) => ({
            value,
            name: ext.values?.[value]?.name ?? value,
            description: ext.values?.[value]?.description,
          }));
          return (
            <AccessRow key={ext.id} label={extensionLabel(ext)}>
              <ValueList values={values} withTooltips={!helpOpen} />
              <HelpCollapse open={helpOpen}>
                {values.map(
                  ({ value, name, description }) =>
                    description && (
                      <span key={value} className="block pt-1">
                        {name}: {description}
                      </span>
                    ),
                )}
              </HelpCollapse>
            </AccessRow>
          );
        })}
        {tool && (
          <AccessRow label={t('c:docs.mcp_tool')}>
            <div className="flex flex-wrap items-center gap-2">
              {codeChip(operation.id)}
              {tool.approvalRequired && (
                <Badge variant="outline" className="border-warning text-warning">
                  {t('c:docs.asks_first')}
                </Badge>
              )}
            </div>
            <HelpCollapse open={helpOpen}>
              <span className="block pt-1">
                {t('c:docs.tool_description.text')} <q>{tool.description}</q>
              </span>
              {tool.approvalRequired && <span className="block pt-1">{t('c:docs.tool_approval.text')}</span>}
            </HelpCollapse>
          </AccessRow>
        )}
      </dl>
    </div>
  );
}

interface AccessValue {
  value: string;
  name: string;
  description?: string;
}

/** Comma-separated values. With `withTooltips`, a pointer that can hover gets each description as a tooltip behind a dotted underline. */
function ValueList({ values, withTooltips }: { values: AccessValue[]; withTooltips?: boolean }) {
  return (
    <span>
      {values.map(({ value, name, description }, index) => (
        <Fragment key={value}>
          {index > 0 && <span className="text-faint-foreground">, </span>}
          {withTooltips && description ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="cursor-default pointer-fine:underline decoration-foreground/40 decoration-dotted underline-offset-3 hover:decoration-foreground" />
                }
              >
                {name}
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6}>
                {description}
              </TooltipContent>
            </Tooltip>
          ) : (
            name
          )}
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
