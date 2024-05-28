import { CommandEmpty } from 'cmdk';
import { Check, Dot, History, Tag, X } from 'lucide-react';
import { useContext, useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useHotkeys } from '~/hooks/use-hot-keys.ts';
import { useMeasure } from '~/hooks/use-measure.tsx';
import { nanoid } from '~/lib/utils.ts';
import { Button } from '~/modules/ui/button';
import { type Label, useElectric } from '../../../common/electric/electrify.ts';
import { Kbd } from '../../../common/kbd.tsx';
import { Badge } from '../../../ui/badge.tsx';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '../../../ui/command.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../../../ui/popover.tsx';
import { TaskContext } from '../../board/board-column.tsx';

const badgeStyle = (color?: string | null) => {
  if (!color) return {};
  return {};
};

interface SetLabelsProps {
  mode: 'create' | 'edit';
  organizationId: string;
  workspaceId: string;
  projectId: string;
  viewValue?: Label[];
  changeLabels?: (labels: Label[]) => void;
  labels: Label[];
}

const SetLabels = ({ mode, viewValue, changeLabels, projectId, organizationId, workspaceId, labels }: SetLabelsProps) => {
  const { t } = useTranslation();
  const formValue = useFormContext?.()?.getValues('labels');
  const [openPopover, setOpenPopover] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState<Label[]>(viewValue ? viewValue : formValue || []);
  const [searchValue, setSearchValue] = useState('');
  const { task, focusedTaskId } = useContext(TaskContext);
  const isSearching = searchValue.length > 0;
  const { ref, bounds } = useMeasure();
  const Electric = useElectric();

  const handleSelectClick = (value?: string) => {
    if (!value) return;
    const existingLabel = selectedLabels.find((label) => label.name === value);
    if (existingLabel) {
      setSelectedLabels(selectedLabels.filter((label) => label.name !== value));
      return;
    }
    const newLabel = labels.find((label) => label.name === value);
    if (newLabel) {
      setSelectedLabels([...selectedLabels, newLabel]);
      return;
    }
  };

  const createLabel = (value: string) => {
    if (!Electric) return toast.error(t('common:local_db_inoperable'));

    const newLabel: Label = {
      id: nanoid(),
      name: value,
      color: '#fff',
      organization_id: organizationId,
      workspace_id: workspaceId,
      project_id: projectId,
    };
    setSelectedLabels((prev) => [...prev, newLabel]);
    setSearchValue('');

    // TODO: Implement the following
    // Save the new label to the database
    Electric.db.labels.create({ data: newLabel });

    //  changeLabels?.([...passedLabels, newLabel]);
  };

  const renderLabels = (labels: Label[]) => {
    return (
      <>
        {labels.map((label, index) => (
          <CommandItem
            key={label.id}
            value={label.name}
            onSelect={(value) => {
              handleSelectClick(value);
              setSearchValue('');
            }}
            className="group rounded-md flex justify-between items-center w-full leading-normal"
          >
            <div className="flex items-center gap-2">
              {isSearching ? <Dot size={16} style={badgeStyle(label.color)} strokeWidth={8} /> : <History size={16} />}
              <span>{label.name}</span>
            </div>
            <div className="flex items-center">
              {selectedLabels.some((l) => l.id === label.id) && <Check size={16} className="text-success" />}
              {!isSearching && <span className="max-xs:hidden text-xs opacity-50 ml-3 mr-1">{index}</span>}
            </div>
          </CommandItem>
        ))}
      </>
    );
  };

  // Open on key press
  useHotkeys([
    [
      'l',
      () => {
        if (focusedTaskId === task.id) setOpenPopover(true);
      },
    ],
  ]);

  // callback to change labels in task card
  useEffect(() => {
    if (changeLabels && JSON.stringify(selectedLabels) !== JSON.stringify(viewValue)) changeLabels(selectedLabels);
  }, [selectedLabels]);

  // Whenever the form value changes (also on reset), update the internal state
  useEffect(() => {
    if (mode === 'edit') return;
    setSelectedLabels(formValue || []);
  }, [formValue]);

  // watch for changes in the viewValue
  useEffect(() => {
    if (mode === 'create') return;
    setSelectedLabels(viewValue || []);
  }, [viewValue]);

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <PopoverTrigger asChild>
        <Button
          ref={ref as React.LegacyRef<HTMLButtonElement>}
          aria-label="Set labels"
          variant="ghost"
          size={mode === 'create' ? 'sm' : 'micro'}
          className={`flex h-auto justify-start font-light ${
            mode === 'create'
              ? 'w-full text-left py-1 min-h-9 border hover:bg-accent/20'
              : 'py-[2px] group-hover/task:opacity-70 group-[.is-focused]/task:opacity-70 opacity-50'
          } ${mode === 'edit' && selectedLabels.length && ''}`}
        >
          {!selectedLabels.length && <Tag size={16} className="opacity-50" />}
          <div className="flex truncate flex-wrap gap-[1px]">
            {mode === 'create' && selectedLabels.length === 0 && <span className="ml-2">Choose labels</span>}
            {selectedLabels.length > 0 &&
              selectedLabels.map(({ name, id, color }) => {
                return (
                  <div key={id} className="flex flex-wrap align-center justify-center items-center rounded-full border pl-2 pr-1 bg-border">
                    <Badge
                      variant="outline"
                      key={id}
                      className={`border-0 font-normal px-1 text-[12px] ${mode === 'create' ? 'text-sm h-6' : 'h-5 bg-transparent'} last:mr-0`}
                      style={badgeStyle(color)}
                    >
                      {name}
                    </Badge>
                    {mode === 'create' && (
                      <Button
                        className="opacity-70 hover:opacity-100 rounded-full w-5 h-5 focus-visible:!ring-offset-0"
                        size="micro"
                        variant="ghost"
                        onClick={(e) => {
                          e.preventDefault();
                          handleSelectClick(name);
                        }}
                      >
                        <X size={16} strokeWidth={3} />
                      </Button>
                    )}
                  </div>
                );
              })}
          </div>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        style={{ width: `${mode === 'create' ? `${Math.round(bounds.left + bounds.right + 2)}` : '260'}px` }}
        className="p-0 rounded-lg"
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
        sideOffset={4}
      >
        <Command className="relative rounded-lg">
          <CommandInput
            value={searchValue}
            onValueChange={(searchValue) => {
              // If the label types a number, select the label like useHotkeys
              if ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].includes(Number.parseInt(searchValue))) {
                handleSelectClick(labels[Number.parseInt(searchValue)]?.name);
                setSearchValue('');
                return;
              }
              setSearchValue(searchValue.toLowerCase());
            }}
            clearValue={setSearchValue}
            className="leading-normal"
            placeholder={t('common:placeholder.search_labels')}
          />
          {!isSearching && <Kbd value="L" className="absolute top-3 right-[10px]" />}
          <CommandList>
            <CommandGroup>
              {!searchValue.length && (
                <>
                  {labels.length === 0 && (
                    <CommandEmpty className="text-muted-foreground text-sm flex items-center justify-center px-3 py-2">
                      {t('common:no_resource_yet', { resource: t('common:labels').toLowerCase() })}
                    </CommandEmpty>
                  )}
                  {renderLabels(labels)}
                </>
              )}
            </CommandGroup>
            <CommandItemCreate onSelect={() => createLabel(searchValue)} {...{ searchValue, labels }} />
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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
