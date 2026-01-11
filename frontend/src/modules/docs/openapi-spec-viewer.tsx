import { useQuery } from '@tanstack/react-query';
import { ChevronsDownUpIcon, ChevronsUpDownIcon, XCircleIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchSpinner } from '~/modules/common/search-spinner';
import Spinner from '~/modules/common/spinner';
import { valuesFirstSort } from '~/modules/docs/helpers/values-first-sort';
import { JsonActions } from '~/modules/docs/json-actions';
import type { ExternalTriggers } from '~/modules/docs/json-editor';
import { githubDarkTheme, JsonEditor } from '~/modules/docs/json-editor';
import { openApiSpecQueryOptions, openApiUrl } from '~/modules/docs/query';
import { Button } from '~/modules/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '~/modules/ui/input-group';
import { useUIStore } from '~/store/ui';
import { cn } from '~/utils/cn';

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

  // Fetch OpenAPI json
  const { data, isLoading, error } = useQuery(openApiSpecQueryOptions);

  if (isLoading) return <Spinner />;

  if (error) {
    return (
      <div className="flex items-center justify-center p-12">
        <span className="text-destructive">{t('common:docs.failed_to_load_openapi')}</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 max-sm:flex-col w-full mb-4">
        {/* Search through JSON */}
        <InputGroup className="max-sm:w-full max-sm:order-last">
          <InputGroupAddon>
            <SearchSpinner value={searchText} isSearching={false} />
          </InputGroupAddon>
          <InputGroupInput
            type="text"
            placeholder={`${t('common:search')}...`}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <InputGroupAddon align="inline-end">
            <XCircleIcon
              size={16}
              className={cn('opacity-70 hover:opacity-100 cursor-pointer', searchText.length ? 'visible' : 'invisible')}
              onClick={() => setSearchText('')}
            />
          </InputGroupAddon>
        </InputGroup>

        {/* Expand */}
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

        {/* Copy, download and open in new tab */}
        <JsonActions
          url={openApiUrl}
          data={data}
          filename="openapi.json"
          resourceName={t('common:docs.openapi_json')}
        />
      </div>

      {/* JSON editor */}
      <div className="rounded-lg bg-muted/30 p-4 overflow-auto">
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
    </>
  );
};

export default OpenApiSpecViewer;
