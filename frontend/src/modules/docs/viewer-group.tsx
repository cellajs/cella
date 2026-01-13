import { BirdIcon, BracesIcon, FileTypeIcon, TextIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { JsonViewer } from '~/modules/docs/json-viewer';
import { ToggleGroup, ToggleGroupItem } from '~/modules/ui/toggle-group';
import { CodeViewer } from './code-viewer';
import type { GenRequest, GenSchema, GenSchemaProperty } from './types';

type SchemaViewMode = 'format' | 'zod' | 'type' | 'example';

interface ViewerGroupProps {
  /** Schema to display in format mode */
  schema: GenSchema | GenSchemaProperty | GenRequest;
  /** Code to display in zod mode */
  zodCode?: string;
  /** Code to display in type mode */
  typeCode?: string;
  /** Example JSON to display in example mode */
  example?: unknown;
  /** Default inspect depth for JsonViewer */
  defaultInspectDepth?: number;
}

/**
 * Reusable component for displaying schema data with format/zod/type toggle views.
 * Used for responses, request body, and parameter schemas.
 */
export const ViewerGroup = ({ schema, zodCode, typeCode, example, defaultInspectDepth = 5 }: ViewerGroupProps) => {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<SchemaViewMode>('format');

  const toggleItems: {
    value: SchemaViewMode;
    icon: typeof TextIcon;
    label: string;
    ariaLabel: string;
    show: boolean;
  }[] = [
    {
      value: 'format',
      icon: TextIcon,
      label: t('common:docs.format'),
      ariaLabel: t('common:docs.view_format'),
      show: true,
    },
    {
      value: 'example',
      icon: BirdIcon,
      label: t('common:example'),
      ariaLabel: t('common:docs.view_example'),
      show: example !== undefined,
    },
    {
      value: 'zod',
      icon: BracesIcon,
      label: t('common:docs.zod'),
      ariaLabel: t('common:docs.view_zod'),
      show: !!zodCode,
    },
    {
      value: 'type',
      icon: FileTypeIcon,
      label: t('common:type'),
      ariaLabel: t('common:docs.view_type'),
      show: !!typeCode,
    },
  ];

  return (
    <div className="relative">
      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(value) => value && setViewMode(value as SchemaViewMode)}
        size="xs"
        variant="outline"
        className="max-md:hidden absolute top-2 bg-muted/50 right-2 z-10"
      >
        {toggleItems
          .filter((item) => item.show)
          .map(({ value, icon: Icon, label, ariaLabel }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={ariaLabel}
              className="opacity-50 hover:opacity-70 data-[state=on]:opacity-100"
            >
              <Icon className="h-4 w-4 mr-1.5" />
              <span className="lowercase text-xs">{label}</span>
            </ToggleGroupItem>
          ))}
      </ToggleGroup>
      <div className="p-3 md:py-6 rounded-md bg-muted/50 overflow-x-auto">
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
            {viewMode === 'example' && example !== undefined && (
              <JsonViewer value={example} rootName={false} defaultInspectDepth={defaultInspectDepth} indentWidth={3} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
