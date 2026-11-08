import { useSuspenseQuery } from '@tanstack/react-query';
import { ChevronsDownUpIcon, ChevronsUpDownIcon, CopyIcon, DownloadIcon, ExternalLinkIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { useDownloader } from '~/hooks/use-downloader';
import { CopiedIcon } from '~/modules/common/copied-icon';
import { JsonViewer } from '~/modules/common/json-viewer/json-viewer';
import { type JsonPath, matchRowPaths } from '~/modules/common/json-viewer/utils';
import { SearchField } from '~/modules/common/search-field';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { FindSteps, stepOnEnter, useMatchSteps } from '~/modules/docs/find-steps';
import { openApiSpecQueryOptions, openApiUrl } from '~/modules/docs/query';
import { Button } from '~/modules/ui/button';
import { ButtonGroup } from '~/modules/ui/button-group';

/** The full OpenAPI spec as JSON, in the viewer's `spec` mode, where a `$ref` scrolls to its target on click. */
export function OpenApiSpecViewer() {
  const { t } = useTranslation();

  const [searchText, setSearchText] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [searchMatchPath, setSearchMatchPath] = useState<JsonPath | null>(null);

  const { data } = useSuspenseQuery(openApiSpecQueryOptions);

  const matchPaths = matchRowPaths(data, searchText);
  const steps = useMatchSteps(matchPaths, setSearchMatchPath);

  const handleSearchChange = (newSearch: string) => {
    setSearchText(newSearch);
    setSearchMatchPath(null);
  };

  return (
    <>
      <JsonActions
        url={openApiUrl}
        data={data}
        filename="openapi.json"
        resourceName={t('c:docs.openapi_json')}
        className="mb-2 w-full *:flex-1 sm:hidden"
      />

      <div className="bg-background sticky top-0 z-10 -mt-2 mb-2 flex items-center gap-2 py-2 max-sm:flex-col">
        <SearchField
          id="openapi-search"
          label={t('c:placeholder.search')}
          value={searchText}
          onSearch={handleSearchChange}
          onKeyDown={stepOnEnter(steps)}
        >
          <FindSteps steps={steps} />
        </SearchField>

        <Button
          variant="outline"
          className="max-sm:hidden"
          // The tree's node toggles are named "Expand" too
          aria-label={isExpanded ? undefined : t('c:expand_all')}
          onClick={() => {
            // Reset to default state by forcing re-mount
            if (isExpanded) setResetKey((prev) => prev + 1);
            setIsExpanded((value) => !value);
          }}
        >
          {isExpanded ? <ChevronsDownUpIcon /> : <ChevronsUpDownIcon />}
          <span>{isExpanded ? t('c:reset') : t('c:expand')}</span>
        </Button>

        <JsonActions url={openApiUrl} data={data} filename="openapi.json" resourceName={t('c:docs.openapi_json')} className="max-sm:hidden" />
      </div>

      <div className="bg-muted/30 overflow-x-auto rounded-lg p-4">
        <JsonViewer
          key={resetKey}
          value={data}
          openapiMode="spec"
          rootName={false}
          enableClipboard
          searchText={searchText}
          showKeyQuotes={false}
          expandAll={isExpanded}
          searchMatchPath={searchMatchPath}
        />
      </div>
    </>
  );
}

interface JsonActionsProps {
  url: string;
  /** Copied as JSON. */
  data: unknown;
  filename: string;
  /** Named in the copy toast. */
  resourceName: string;
  className?: string;
}

function JsonActions({ url, data, filename, resourceName, className }: JsonActionsProps) {
  const { t } = useTranslation();

  const { copyToClipboard, copied } = useCopyToClipboard();
  const { download, isInProgress } = useDownloader();

  const handleCopy = () => {
    copyToClipboard(JSON.stringify(data, null, 2));
    toaster.success(t('c:success.copy_resource', { resource: resourceName }));
  };

  const handleOpen = () => window.open(url, '_blank', 'noopener,noreferrer');

  return (
    <ButtonGroup className={className}>
      <TooltipButton toolTipContent={t('c:docs.open_in_new_tab')}>
        <Button variant="outline" className="flex-none" aria-label={t('c:docs.open_in_new_tab')} onClick={handleOpen}>
          <ExternalLinkIcon />
          <span className="max-lg:hidden">{t('c:open')}</span>
        </Button>
      </TooltipButton>
      <TooltipButton toolTipContent={t('c:docs.copy_json')}>
        <Button variant="outline" aria-label={t('c:docs.copy_json')} onClick={handleCopy}>
          <CopiedIcon copied={copied} icon={CopyIcon} />
          <span className="max-lg:hidden">{t('c:copy')}</span>
        </Button>
      </TooltipButton>
      <TooltipButton toolTipContent={t('c:docs.download_json')}>
        <Button
          variant="outline"
          className="flex-none"
          aria-label={t('c:docs.download_json')}
          disabled={isInProgress}
          onClick={() => download(url, filename)}
        >
          {isInProgress ? <Spinner size="sm" noDelay /> : <DownloadIcon />}
          <span className="max-lg:hidden">{t('c:download')}</span>
        </Button>
      </TooltipButton>
    </ButtonGroup>
  );
}
