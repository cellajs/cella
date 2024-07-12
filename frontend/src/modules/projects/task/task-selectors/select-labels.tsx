import { CommandEmpty } from 'cmdk';
import { Check, Dot, History, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { nanoid, recentlyUsed } from '~/lib/utils.ts';
import { type Task, useElectric, type Label } from '../../../common/electric/electrify.ts';
import { Kbd } from '../../../common/kbd.tsx';
import { Badge } from '../../../ui/badge.tsx';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandLoading } from '../../../ui/command.tsx';
import { inNumbersArray } from './helpers.ts';
import { toast } from 'sonner';
import { useUserStore } from '~/store/user.ts';
import { useWorkspaceStore } from '~/store/workspace.ts';
import { useLiveQuery } from 'electric-sql/react';
import { useWorkspaceUIStore } from '~/store/workspace-ui.ts';

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
  taskUpdateCallback?: (task: Task) => void;
}

const SetLabels = ({ value, projectId, organizationId, taskUpdateCallback, creationValueChange, triggerWidth = 280 }: SetLabelsProps) => {
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const Electric = useElectric()!;
  const { t } = useTranslation();
  const [selectedLabels, setSelectedLabels] = useState<Label[]>(value);
  const [searchValue, setSearchValue] = useState('');

  const { changeColumn } = useWorkspaceUIStore();
  const user = useUserStore((state) => state.user);
  const { focusedTaskId, workspace } = useWorkspaceStore();
  const isSearching = searchValue.length > 0;

  const { results: labels = [], updatedAt } = useLiveQuery(
    Electric.db.labels.liveMany({
      where: {
        project_id: projectId,
      },
      orderBy: {
        last_used: 'desc',
      },
    }),
  ) as {
    results: Label[] | undefined;
    updatedAt: Date | undefined;
  };

  const showedLabels = useMemo(() => {
    if (selectedLabels.length > 8) return selectedLabels;
    const nonSelectedLabels = labels.filter((label) => !selectedLabels.some((selected) => selected.id === label.id));
    // save to recent labels all labels that used in past 3 days
    changeColumn(workspace.id, projectId, {
      recentLabels: labels.filter((l) => recentlyUsed(l.last_used, 3)),
    });
    return [...selectedLabels, ...nonSelectedLabels].slice(0, 8);
  }, [selectedLabels, labels]);

  const searchedLabels: Label[] = useMemo(() => {
    if (isSearching) return labels.filter((l) => l.name.includes(searchValue));
    return [];
  }, [searchValue, labels]);

  const createLabel = (newLabel: Label) => {
    if (!Electric) return toast.error(t('common:local_db_inoperable'));
    // TODO: Implement the following
    // Save the new label to the database
    Electric.db.labels.create({ data: newLabel });
  };

  const updateTaskLabels = (labels: Label[]) => {
    if (!Electric) return toast.error(t('common:local_db_inoperable'));
    if (!focusedTaskId) return;
    const db = Electric.db;
    const labelsIds = labels.map((l) => l.id);
    db.tasks
      .update({
        data: {
          labels: labelsIds,
          modified_at: new Date(),
          modified_by: user.id,
        },
        where: {
          id: focusedTaskId,
        },
      })
      .then((updatedTask) => {
        if (taskUpdateCallback) taskUpdateCallback(updatedTask as Task);
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
    <Command className="relative rounded-lg" style={{ width: `${triggerWidth}px` }}>
      <CommandInput
        autoFocus={true}
        value={searchValue}
        onValueChange={(searchValue) => {
          // If the label types a number, select the label like useHotkeys
          if (inNumbersArray(8, searchValue)) return handleSelectClick(labels[Number.parseInt(searchValue) - 1]?.name);
          setSearchValue(searchValue.toLowerCase());
        }}
        clearValue={setSearchValue}
        wrapClassName="max-sm:hidden"
        className="leading-normal"
        placeholder={t('common:placeholder.search_labels')}
      />
      {!isSearching && <Kbd value="L" className="absolute top-3 right-2.5" />}
      <CommandList>
        <CommandGroup>
          {!updatedAt && (
            <CommandLoading>
              <Loader2 className="text-muted-foreground h-6 w-6 mx-auto mt-2 animate-spin" />
            </CommandLoading>
          )}
          {!isSearching ? (
            <>
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
                    {isSearching ? <Dot className="rounded-md" size={16} style={badgeStyle(label.color)} strokeWidth={8} /> : <History size={16} />}
                    <span>{label.name}</span>
                  </div>
                  <div className="flex items-center">
                    {selectedLabels.some((l) => l.id === label.id) && <Check size={16} className="text-success" />}
                    {!isSearching && <span className="max-xs:hidden text-xs opacity-50 ml-3 mr-1">{index + 1}</span>}
                  </div>
                </CommandItem>
              ))}
            </>
          ) : searchedLabels.length > 0 ? (
            <>
              {searchedLabels.map((label, index) => (
                <CommandItem
                  key={label.id}
                  value={label.name}
                  onSelect={(value) => {
                    handleSelectClick(value);
                  }}
                  className="group rounded-md flex justify-between items-center w-full leading-normal"
                >
                  <div className="flex items-center gap-2">
                    {isSearching ? <Dot className="rounded-md" size={16} style={badgeStyle(label.color)} strokeWidth={8} /> : <History size={16} />}
                    <span>{label.name}</span>
                  </div>
                  <div className="flex items-center">
                    {selectedLabels.some((l) => l.id === label.id) && <Check size={16} className="text-success" />}
                    {!isSearching && <span className="max-xs:hidden text-xs opacity-50 ml-3 mr-1">{index + 1}</span>}
                  </div>
                </CommandItem>
              ))}
            </>
          ) : (
            <CommandItemCreate onSelect={() => handleCreateClick(searchValue)} {...{ searchValue, labels }} />
          )}
        </CommandGroup>
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
  const hasNoLabel = !labels.map(({ id }) => id).includes(`${searchValue}`);

  const render = searchValue !== '' && hasNoLabel;

  if (!render) return null;

  // BUG: whenever a space is appended, the Create-Button will not be shown.
  return (
    <CommandItem key={`${searchValue}`} value={`${searchValue}`} className="text-sm m-1 flex justify-center items-center" onSelect={onSelect}>
      {t('common:create_resource', { resource: t('common:label').toLowerCase() })}
      <Badge className="ml-2 px-2 py-0 font-light" variant="plain">
        {searchValue}
      </Badge>
    </CommandItem>
  );
};
