import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { appConfig } from 'config';
import {
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CopyCheckIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  SearchIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useDownloader from 'react-use-downloader';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import Spinner from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/service';
import { valuesFirstSort } from '~/modules/docs/helpers/values-first-sort';
import type { ExternalTriggers } from '~/modules/docs/json-editor';
import { githubDarkTheme, JsonEditor } from '~/modules/docs/json-editor';
import { Button, buttonVariants } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';
import { useUIStore } from '~/store/ui';
import { cn } from '~/utils/cn';

// OpenAPI spec URL in public/static
const openapiUrl = `${appConfig.frontendUrl}/static/openapi.json`;

/**
 * Displays the full OpenAPI specification JSON with collapsible sections.
 * Includes search functionality and a copy-to-clipboard button.
 */
const OpenApiSpecViewer = () => {
  const { t } = useTranslation();
  const mode = useUIStore((state) => state.mode);
  const [searchText, setSearchText] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [triggers, setTriggers] = useState<ExternalTriggers | undefined>();
  const { copyToClipboard, copied } = useCopyToClipboard();
  const { download, isInProgress } = useDownloader();

  const { data, isLoading, error } = useQuery({
    queryKey: ['openapi-spec'],
    queryFn: async () => {
      const response = await fetch(openapiUrl);
      if (!response.ok) throw new Error('Failed to fetch OpenAPI spec');
      return response.json();
    },
    staleTime: Number.POSITIVE_INFINITY, // Static file, never stale
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <span className="text-muted-foreground">{t('common:docs.loading_openapi')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12">
        <span className="text-destructive">{t('common:docs.failed_to_load_openapi')}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold">{t('common:docs.openapi_specification')}</h1>
        <p className="text-muted-foreground mt-1">
          {t('common:docs.openapi_spec_description', { title: data?.info?.title || 'API' })}
        </p>
      </header>
      <div className="flex items-center gap-2 max-sm:flex-col w-full">
        <div className="relative max-sm:w-full max-sm:order-last grow">
          <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder={`${t('common:search')}...`}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="pl-9 w-full"
          />
        </div>
        <Button
          variant="outline"
          className="gap-2 max-sm:w-full"
          aria-label={isExpanded ? 'Collapse all' : 'Expand all'}
          onClick={() => {
            if (isExpanded) {
              // Reset to default state by forcing re-mount (faster than animating all nodes)
              setResetKey((k) => k + 1);
              setTriggers(undefined);
            } else {
              setTriggers({ collapse: { path: [], collapsed: false, includeChildren: true } });
            }
            setIsExpanded(!isExpanded);
          }}
        >
          {isExpanded ? <ChevronsDownUpIcon size={16} /> : <ChevronsUpDownIcon size={16} />}
          <span>{isExpanded ? t('common:collapse') : t('common:expand')}</span>
        </Button>
        <Link
          to={openapiUrl}
          target="_blank"
          draggable={false}
          aria-label="Open in new tab"
          className={cn(buttonVariants({ variant: 'outline' }), 'gap-2 max-sm:w-full')}
        >
          <ExternalLinkIcon size={16} />
          <span>{t('common:open')}</span>
        </Link>
        <Button
          variant="outline"
          className="gap-2 max-sm:w-full"
          aria-label="Copy JSON"
          onClick={() => {
            copyToClipboard(JSON.stringify(data, null, 2));
            toaster(t('common:success.resource_copied', { resource: t('common:docs.openapi_json') }), 'success');
          }}
        >
          {copied ? <CopyCheckIcon size={16} /> : <CopyIcon size={16} />}
          <span>{t('common:copy')}</span>
        </Button>
        <Button
          variant="outline"
          className="gap-2 max-sm:w-full"
          disabled={isInProgress}
          aria-label="Download"
          onClick={() => download(openapiUrl, 'openapi.json')}
        >
          {isInProgress ? <Spinner className="size-4" noDelay /> : <DownloadIcon size={16} />}
          <span>{t('common:download')}</span>
        </Button>
      </div>
      <div className="rounded-lg border bg-muted/30 p-4 overflow-auto">
        <JsonEditor
          hideRoot
          key={resetKey}
          data={data}
          collapse={2}
          keySort={valuesFirstSort}
          restrictEdit={true}
          searchText={searchText}
          searchFilter="all"
          enableClipboard={true}
          restrictDelete
          restrictAdd
          showStringQuotes={true}
          showArrayIndices={true}
          showCollectionCount="when-closed"
          indent={2}
          rootFontSize="13px"
          externalTriggers={triggers}
          theme={mode === 'dark' ? githubDarkTheme : undefined}
        />
      </div>
    </div>
  );
};

export default OpenApiSpecViewer;
