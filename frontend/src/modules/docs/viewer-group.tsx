import { BracesIcon, FileTypeIcon, TextIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { JsonViewer } from '~/modules/docs/json-viewer';
import { ToggleGroup, ToggleGroupItem } from '~/modules/ui/toggle-group';
import { CodeViewer } from './code-viewer';
import type { GenRequest, GenSchema, GenSchemaProperty } from './types';

type SchemaViewMode = 'format' | 'zod' | 'type';

interface ViewerGroupProps {
  /** Schema to display in format mode */
  schema: GenSchema | GenSchemaProperty | GenRequest;
  /** Code to display in zod mode */
  zodCode?: string;
  /** Code to display in type mode */
  typeCode?: string;
  /** Default inspect depth for JsonViewer */
  defaultInspectDepth?: number;
}

/**
 * Reusable component for displaying schema data with format/zod/type toggle views.
 * Used for responses, request body, and parameter schemas.
 */
export const ViewerGroup = ({ schema, zodCode, typeCode, defaultInspectDepth = 5 }: ViewerGroupProps) => {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<SchemaViewMode>('format');

  return (
    <div className="relative">
      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(value) => value && setViewMode(value as SchemaViewMode)}
        size="xs"
        variant="outline"
        className="max-md:hidden absolute top-2 right-2 z-10"
      >
        <ToggleGroupItem value="format" aria-label={t('common:docs.view_format')}>
          <TextIcon className="h-4 w-4 mr-1.5" />
          <span className="lowercase text-xs">{t('common:docs.format')}</span>
        </ToggleGroupItem>
        {zodCode && (
          <ToggleGroupItem value="zod" aria-label={t('common:docs.view_zod')}>
            <BracesIcon className="h-4 w-4 mr-1.5" />
            <span className="lowercase text-xs">{t('common:docs.zod')}</span>
          </ToggleGroupItem>
        )}
        {typeCode && (
          <ToggleGroupItem value="type" aria-label={t('common:docs.view_type')}>
            <FileTypeIcon className="h-4 w-4 mr-1.5" />
            <span className="lowercase text-xs">{t('common:type')}</span>
          </ToggleGroupItem>
        )}
      </ToggleGroup>
      <div className="p-3 md:pt-6 rounded-md bg-muted/50">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={viewMode}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {viewMode === 'format' && (
              <JsonViewer
                value={schema}
                showKeyQuotes={false}
                openapiMode="schema"
                rootName={false}
                defaultInspectDepth={defaultInspectDepth}
                indentWidth={3}
              />
            )}
            {viewMode === 'zod' && zodCode && <CodeViewer code={zodCode} language="zod" />}
            {viewMode === 'type' && typeCode && <CodeViewer code={typeCode} language="typescript" />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
