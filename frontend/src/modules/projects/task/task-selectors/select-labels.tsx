import { CommandEmpty } from 'cmdk';
import { Check, Dot, History, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { nanoid, recentlyUsed } from '~/lib/utils.ts';
import { useUserStore } from '~/store/user.ts';
import { useWorkspaceUIStore } from '~/store/workspace-ui.ts';
import { useWorkspaceStore } from '~/store/workspace.ts';
import { type Label, useElectric } from '~/modules/common/electric/electrify.ts';
import { Kbd } from '~/modules/common/kbd.tsx';
import { Badge } from '../../../ui/badge.tsx';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandLoading } from '../../../ui/command.tsx';
import { inNumbersArray } from './helpers.ts';

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
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const Electric = useElectric()!;
  const { t } = useTranslation();
  const { changeColumn } = useWorkspaceUIStore();
  const user = useUserStore((state) => state.user);
  const { focusedTaskId, workspace, labels } = useWorkspaceStore();

  const [selectedLabels, setSelectedLabels] = useState<Label[]>(value);
  const [searchValue, setSearchValue] = useState('');
  const [isRemoving, setIsRemoving] = useState(false);

  const [orderedLabels] = useState(labels.filter((l) => l.project_id === projectId).sort((a, b) => b.last_used.getTime() - a.last_used.getTime()));

  const isSearching = searchValue.length > 0;

  const showedLabels = useMemo(() => {
    if (searchValue.length) return orderedLabels.filter((l) => l.name.toLowerCase().includes(searchValue));
    if (isRemoving) return selectedLabels;
    // save to recent labels all labels that used in past 3 days
    changeColumn(workspace.id, projectId, {
      recentLabels: orderedLabels.filter((l) => recentlyUsed(l.last_used, 3)),
    });
    return orderedLabels.slice(0, 8);
  }, [isRemoving, searchValue]);

  const createLabel = (newLabel: Label) => {
    if (!Electric) return toast.error(t('common:local_db_inoperable'));
    // Save the new label to the database
    Electric.db.labels.create({ data: newLabel });
  };

  const updateTaskLabels = (labels: Label[]) => {
    if (!Electric) return toast.error(t('common:local_db_inoperable'));
    if (!focusedTaskId) return;
    const db = Electric.db;
    const labelsIds = labels.map((l) => l.id);
    db.tasks.update({
      data: {
        labels: labelsIds,
        modified_at: new Date(),
        modified_by: user.id,
      },
      where: {
        id: focusedTaskId,
      },
    });
    return;
  };

  const updateLabel = (labelId: string, useCount: number) => {
    if (!Electric) return toast.error(t('common:local_db_inoperable'));
    Electric.db.labels.update({
      data: {
        last_used: new Date(),
        use_count: useCount,
      },
      where: {
        id: labelId,
      },
    });
  };

  const handleSelectClick = (value?: string) => {
    if (!value) return;
    setSearchValue('');
    const existingLabel = selectedLabels.find((label) => label.name === value);
    if (existingLabel) {
      const updatedLabels = selectedLabels.filter((label) => label.name !== value);
      setSelectedLabels(updatedLabels);
      if (creationValueChange) return creationValueChange(updatedLabels);
      updateTaskLabels(updatedLabels);
      updateLabel(existingLabel.id, existingLabel.use_count + 1);
      return;
    }
    const newLabel = labels.find((label) => label.name === value);
    if (newLabel) {
      const updatedLabels = [...selectedLabels, newLabel];
      setSelectedLabels(updatedLabels);
      if (creationValueChange) return creationValueChange(updatedLabels);
      updateLabel(newLabel.id, newLabel.use_count + 1);
      updateTaskLabels(updatedLabels);
      return;
    }
  };

  const handleCreateClick = (value: string) => {
    setSearchValue('');
    if (labels.find((l) => l.name === value)) return handleSelectClick(value);

    const newLabel: Label = {
      id: nanoid(),
      name: value,
      color: '#FFA9BA',
      organization_id: organizationId,
      project_id: projectId,
      last_used: new Date(),
      use_count: 1,
    };

    createLabel(newLabel);
    const updatedLabels = [...selectedLabels, newLabel];
    setSelectedLabels(updatedLabels);
    updateTaskLabels(updatedLabels);
  };

  useEffect(() => {
    setSelectedLabels(value);
  }, [value]);

  return (
    <Command className="relative rounded-lg max-h-[40vh] overflow-y-auto" style={{ width: `${triggerWidth}px` }}>
      <CommandInput
        autoFocus={true}
        value={searchValue}
        onValueChange={(searchValue) => {
          // If the label types a number, select the label like useHotkeys
          if (inNumbersArray(6, searchValue)) return handleSelectClick(labels[Number.parseInt(searchValue) - 1]?.name);
          setSearchValue(searchValue.toLowerCase());
        }}
        clearValue={setSearchValue}
        className="leading-normal"
        placeholder={t('common:placeholder.search_labels')}
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
              {t('common:no_resource_yet', { resource: t('common:labels').toLowerCase() })}
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
                {isSearching || isRemoving ? (
                  <Dot className="rounded-md" size={16} style={badgeStyle(label.color)} strokeWidth={8} />
                ) : (
                  <History size={16} />
                )}
                <span>{label.name}</span>
              </div>
              <div className="flex items-center">
                {selectedLabels.some((l) => l.id === label.id) && <Check size={16} className="text-success" />}
                {!isSearching && <span className="max-sm:hidden text-xs opacity-50 ml-3 mr-1">{index + 1}</span>}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
        {!isSearching ? (
          <CommandItem className="flex justify-center text-sm m-1" onSelect={() => setIsRemoving(!isRemoving)}>
            {isRemoving ? 'Show recent labels' : 'Show selected labels'}
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
      {t('common:create_resource', { resource: t('common:label').toLowerCase() })}
      <Badge className="ml-2 px-2 py-0 font-light flex  items-center" variant="plain">
        {searchValue}
      </Badge>
    </CommandItem>
  );
};
