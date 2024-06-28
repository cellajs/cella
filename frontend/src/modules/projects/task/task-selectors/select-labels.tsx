import { CommandEmpty } from 'cmdk';
import { Check, Dot, History } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
// import { useHotkeys } from '~/hooks/use-hot-keys.ts';
import { nanoid } from '~/lib/utils.ts';
import { type Label, useElectric } from '../../../common/electric/electrify.ts';
import { Kbd } from '../../../common/kbd.tsx';
import { Badge } from '../../../ui/badge.tsx';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '../../../ui/command.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../../../ui/popover.tsx';

export const badgeStyle = (color?: string | null) => {
  if (!color) return {};
  return { background: color };
};

interface SetLabelsProps {
  labels: Label[];
  value: Label[];
  children: React.ReactNode;
  organizationId: string;
  projectId: string;
  changeLabels: (labels: Label[]) => void;
  triggerWidth?: number;
}

const SetLabels = ({ value, changeLabels, children, projectId, organizationId, labels, triggerWidth = 260 }: SetLabelsProps) => {
  const { t } = useTranslation();
  const [openPopover, setOpenPopover] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState<Label[]>(value);
  const [searchValue, setSearchValue] = useState('');
  const isSearching = searchValue.length > 0;

  const Electric = useElectric();

  const handleSelectClick = (value?: string) => {
    if (!value) return;
    const existingLabel = selectedLabels.find((label) => label.name === value);
    if (existingLabel) {
      const updatedLabels = selectedLabels.filter((label) => label.name !== value);
      setSelectedLabels(updatedLabels);
      changeLabels(updatedLabels);
      return;
    }
    const newLabel = labels.find((label) => label.name === value);
    if (newLabel) {
      const updatedLabels = [...selectedLabels, newLabel];
      setSelectedLabels(updatedLabels);
      changeLabels(updatedLabels);
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
      project_id: projectId,
    };
    setSelectedLabels((prev) => [...prev, newLabel]);
    setSearchValue('');

    // TODO: Implement the following
    // Save the new label to the database
    Electric.db.labels.create({ data: newLabel });
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
  // useHotkeys([
  //   [
  //     'l',
  //     () => {
  //       if (focusedTaskId === task.id) setOpenPopover(true);
  //     },
  //   ],
  // ]);

  useEffect(() => {
    setSelectedLabels(value);
  }, [value]);

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        style={{ width: `${triggerWidth}px` }}
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
          {!isSearching && <Kbd value="L" className="absolute top-3 right-2.5" />}
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
