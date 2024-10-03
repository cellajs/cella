import { useLocation } from '@tanstack/react-router';
import { CommandEmpty } from 'cmdk';
import { Check, Dot, History, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type CreateLabelParams, createLabel, updateLabel } from '~/api/labels.ts';
import { updateTask } from '~/api/tasks.ts';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useMutateQueryData } from '~/hooks/use-mutate-query-data';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { Kbd } from '~/modules/common/kbd.tsx';
import { inNumbersArray } from '~/modules/tasks/helpers';
import { Badge } from '~/modules/ui/badge.tsx';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandLoading } from '~/modules/ui/command.tsx';
import { useWorkspaceUIStore } from '~/store/workspace-ui.ts';
import { useWorkspaceStore } from '~/store/workspace.ts';
import type { Label } from '~/types/app';
import { dateIsRecent } from '~/utils/date-is-recent';
import { nanoid } from '~/utils/nanoid';

export const badgeStyle = (color?: string | null) => {
  if (!color) return {};
  return { background: color };
};

interface SetLabelsProps {
  value: Label[];
  organizationId: string;
  projectId: string;
  triggerWidth?: number;
  creationValueChange?: (labels: Label[]) => void;
}

const SetLabels = ({ value, projectId, organizationId, creationValueChange, triggerWidth = 280 }: SetLabelsProps) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isMobile = useBreakpoints('max', 'sm');
  const { changeColumn } = useWorkspaceUIStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const { focusedTaskId, workspace, labels, projects } = useWorkspaceStore();
  const callback = useMutateQueryData(['labels', projects.map((p) => p.id).join('_')]);

  const [selectedLabels, setSelectedLabels] = useState<Label[]>(value);
  const [searchValue, setSearchValue] = useState('');
  const [isRecent, setIsRecent] = useState(!isMobile);

  const orderedLabels = useMemo(
    () => labels.filter((l) => l.projectId === projectId).sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()),
    [labels],
  );

  const isSearching = searchValue.length > 0;

  const showedLabels = useMemo(() => {
    if (searchValue.length) return orderedLabels.filter((l) => l.name.toLowerCase().includes(searchValue));
    if (!isRecent) return selectedLabels;
    // save to recent labels all labels that used in past 3 days
    changeColumn(workspace.id, projectId, {
      recentLabels: orderedLabels.filter((l) => dateIsRecent(l.lastUsed, 3)),
    });
    return orderedLabels.slice(0, 8);
  }, [isRecent, searchValue, orderedLabels, selectedLabels]);

  const updateTaskLabels = async (labels: Label[]) => {
    if (!focusedTaskId) return;
    try {
      const labelIds = labels.map((l) => l.id);
      const updatedTask = await updateTask(focusedTaskId, workspace.organizationId, 'labels', labelIds);
      const eventName = pathname.includes('/board') ? 'taskOperation' : 'taskTableOperation';
      dispatchCustomEvent(eventName, { array: [updatedTask], action: 'update', projectId: updatedTask.projectId });
      return;
    } catch (err) {
      toast.error(t('common:error.update_resource', { resource: t('app:task') }));
    }
  };

  const handleSelectClick = async (value?: string) => {
    if (!value) return;
    setSearchValue('');
    const existingLabel = selectedLabels.find((label) => label.name === value);
    if (existingLabel) {
      const updatedLabels = selectedLabels.filter((label) => label.name !== value);
      setSelectedLabels(updatedLabels);
      if (creationValueChange) return creationValueChange(updatedLabels);
      await updateTaskLabels(updatedLabels);
      await updateLabel(existingLabel.id, workspace.organizationId, existingLabel.useCount + 1);
      return;
    }
    const newLabel = labels.find((label) => label.name === value);
    if (newLabel) {
      const updatedLabels = [...selectedLabels, newLabel];
      setSelectedLabels(updatedLabels);
      if (creationValueChange) return creationValueChange(updatedLabels);
      await updateLabel(newLabel.id, workspace.organizationId, newLabel.useCount + 1);
      await updateTaskLabels(updatedLabels);
      return;
    }
  };

  const handleCreateClick = async (value: string) => {
    setSearchValue('');
    if (labels.find((l) => l.name === value)) return handleSelectClick(value);

    const newLabel: CreateLabelParams = {
      id: nanoid(),
      name: value,
      color: '#FFA9BA',
      organizationId: organizationId,
      projectId: projectId,
      lastUsed: new Date().toString(),
      useCount: 1,
    };

    await createLabel(newLabel, workspace.organizationId);
    const updatedLabels = [...selectedLabels, newLabel];
    setSelectedLabels(updatedLabels);
    callback([newLabel], 'create');
    if (creationValueChange) return creationValueChange(updatedLabels);
    await updateTaskLabels(updatedLabels);
  };

  //when removing selectedLabels, switch to recent labels mode
  useEffect(() => {
    if (selectedLabels.length) return;
    setIsRecent(true);
  }, [selectedLabels]);

  useEffect(() => {
    setSelectedLabels(value);
  }, [value]);

  return (
    <Command className="relative rounded-lg max-h-[44vh] overflow-y-auto" style={{ width: `${triggerWidth}px` }}>
      <CommandInput
        ref={inputRef}
        autoFocus={true}
        value={searchValue}
        onValueChange={(searchValue) => {
          // If the label types a number, select the label like useHotkeys
          if (inNumbersArray(6, searchValue)) return handleSelectClick(labels[Number.parseInt(searchValue) - 1]?.name);
          setSearchValue(searchValue.toLowerCase());
        }}
        clearValue={setSearchValue}
        className="leading-normal min-h-10"
        placeholder={showedLabels.length ? t('app:placeholder.search_labels') : t('app:create_label.text')}
      />
      {!isSearching && <Kbd value="L" className="max-sm:hidden absolute top-3 right-2.5" />}
      <CommandList>
        <CommandGroup>
          {!labels && (
            <CommandLoading>
              <Loader2 className="text-muted-foreground h-6 w-6 mx-auto mt-2 animate-spin" />
            </CommandLoading>
          )}
          {labels.length === 0 && (
            <CommandEmpty className="text-muted-foreground text-sm flex items-center justify-center px-3 py-2">
              {t('common:no_resource_yet', { resource: t('app:labels').toLowerCase() })}
            </CommandEmpty>
          )}
          {showedLabels.map((label, index) => (
            <CommandItem
              key={label.id}
              value={label.name}
              onSelect={(value) => {
                handleSelectClick(value);
              }}
              className="group rounded-md flex justify-between items-center w-full leading-normal"
            >
              <div className="flex items-center gap-2">
                {isSearching || !isRecent ? (
                  <Dot className="rounded-md" size={16} style={badgeStyle(label.color)} strokeWidth={8} />
                ) : (
                  <History size={16} />
                )}
                <span>{label.name}</span>
              </div>
              <div className="flex items-center">
                <Check size={16} className={`text-success ${!selectedLabels.some((l) => l.id === label.id) && 'invisible'}`} />
                {!isSearching && <span className="max-sm:hidden text-xs opacity-50 ml-3 mr-1">{index + 1}</span>}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
        {!isSearching && selectedLabels.length && creationValueChange === undefined ? (
          <CommandItem
            className="flex justify-center text-xs m-1"
            onSelect={() => {
              setIsRecent(!isRecent);
              if (inputRef.current && !isMobile) inputRef.current.focus();
            }}
          >
            {isRecent ? 'Show selected labels' : 'Show recent labels'}
          </CommandItem>
        ) : (
          <CommandItemCreate onSelect={() => handleCreateClick(searchValue)} searchValue={searchValue} labels={labels} />
        )}
      </CommandList>
    </Command>
  );
};

export default SetLabels;

interface CommandItemCreateProps {
  searchValue: string;
  labels: Label[];
  onSelect: () => void;
}

const CommandItemCreate = ({ searchValue, labels, onSelect }: CommandItemCreateProps) => {
  const { t } = useTranslation();
  const hasNoLabel = !labels.map(({ name }) => name.toLowerCase()).includes(searchValue.trim());
  const render = searchValue.trim() !== '' && hasNoLabel;

  if (!render) return null;

  // BUG: whenever a space is appended, the Create-Button will not be shown.
  return (
    <CommandItem className="text-sm m-1 flex justify-center items-center" onSelect={onSelect}>
      {t('common:create_resource', { resource: t('app:label').toLowerCase() })}
      <Badge className="ml-2 px-2 py-0 font-light flex" variant="plain">
        {searchValue}
      </Badge>
    </CommandItem>
  );
};
