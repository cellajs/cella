import { UserX } from 'lucide-react';
import { useContext, useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useHotkeys } from '~/hooks/use-hot-keys.ts';
import { useMeasure } from '~/hooks/use-measure.tsx';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { AvatarGroup, AvatarGroupList, AvatarOverflowIndicator } from '~/modules/ui/avatar';
import { Button } from '~/modules/ui/button';
import { Kbd } from '../common/kbd.tsx';
import { Command, CommandInput } from '../ui/command.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.tsx';
import { TaskContext } from './board-column';
import type { User } from '~/types/index.ts';

interface AssignMembersProps {
  mode: 'create' | 'edit';
  viewValue?: User[];
  changeAssignedTo?: (users: User[]) => void;
}

const AssignMembers = ({ mode, viewValue, changeAssignedTo }: AssignMembersProps) => {
  // const { project } = useContext(ProjectContext);
  const { t } = useTranslation();
  const formValue = useFormContext?.()?.getValues('assignedTo');
  const [openPopover, setOpenPopover] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<User[]>(viewValue ? viewValue : formValue || []);
  const [searchValue, setSearchValue] = useState('');
  const isSearching = searchValue.length > 0;
  const { ref, bounds } = useMeasure();
  const { task, focusedTaskId } = useContext(TaskContext);
  // const handleSelectClick = (name: string) => {
  // if (!name) return;
  // const existingUser = selectedUsers.find((user) => user.name === name);
  // if (existingUser) {
  //   setSelectedUsers(selectedUsers.filter((user) => user.name !== name));
  //   return;
  // }
  // const newUser = project.members.find((user) => user.name === name);
  // if (newUser) {
  //   setSelectedUsers([...selectedUsers, newUser]);
  //   return;
  // }
  // };
  // Open on key press
  useHotkeys([
    [
      'a',
      () => {
        if (focusedTaskId === task.id) setOpenPopover(true);
      },
    ],
  ]);

  useEffect(() => {
    if (changeAssignedTo && selectedUsers.length > 0) changeAssignedTo(selectedUsers);
  }, [selectedUsers]);

  // Whenever the form value changes (also on reset), update the internal state
  useEffect(() => {
    if (mode === 'edit') return;
    setSelectedUsers(formValue || []);
  }, [formValue]);

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <PopoverTrigger asChild>
        <Button
          ref={ref as React.LegacyRef<HTMLButtonElement>}
          aria-label="Assign"
          variant="ghost"
          size={mode === 'create' ? 'sm' : 'micro'}
          className={`flex justify-start font-light ${mode === 'create' ? 'w-full text-left border' : 'group-hover/task:opacity-100 opacity-70'} ${
            mode === 'edit' && selectedUsers.length && 'px-0 hover:bg-transparent'
          }`}
        >
          {!selectedUsers.length && <UserX className="h-4 w-4 opacity-50" />}
          {!!selectedUsers.length && (
            <AvatarGroup limit={3}>
              <AvatarGroupList>
                {selectedUsers.map((user) => {
                  return <AvatarWrap type="USER" key={user.id} id={user.id} name={user.name} url={user.thumbnailUrl} className="h-6 w-6 text-xs" />;
                })}
              </AvatarGroupList>
              <AvatarOverflowIndicator className="h-6 w-6 text-xs" />
            </AvatarGroup>
          )}
          {mode === 'create' && (
            <span className="ml-2 truncate">
              {selectedUsers.length === 0 && 'Assign to'}
              {selectedUsers.length === 1 && selectedUsers[0].name}
              {selectedUsers.length === 2 && selectedUsers.map(({ name }) => name).join(', ')}
              {selectedUsers.length > 2 && `${selectedUsers.length} assigned`}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        style={{ width: `${mode === 'create' ? `${Math.round(bounds.left + bounds.right + 2)}` : '240'}px` }}
        className="p-0 rounded-lg"
        align="end"
        onCloseAutoFocus={(e) => e.preventDefault()}
        sideOffset={4}
      >
        <Command className="relative rounded-lg">
          <CommandInput
            value={searchValue}
            onValueChange={(searchValue) => {
              // If the user types a number, select the user like useHotkeys
              if ([0, 1, 2, 3, 4, 5, 6].includes(Number.parseInt(searchValue))) {
                // handleSelectClick(project.members[Number.parseInt(searchValue)]?.name);
                setSearchValue('');
                return;
              }
              setSearchValue(searchValue);
            }}
            clearValue={setSearchValue}
            className="leading-normal"
            placeholder={t('common:placeholder.assign')}
          />
          {!isSearching && <Kbd value="A" className="absolute top-3 right-[10px]" />}
          {/* <CommandList>
            {project?.members && (
              <CommandGroup>
                {project.members.map((member, index) => (
                  <CommandItem
                    key={member.name}
                    value={member.name}
                    onSelect={(name) => {
                      handleSelectClick(name);
                      setSearchValue('');
                    }}
                    className="group rounded-md flex justify-between items-center w-full leading-normal"
                  >
                    <div className="flex items-center gap-3">
                      <AvatarWrap type="USER" id={member.id} name={member.name} url={member.thumbnailUrl} className="h-6 w-6 text-xs" />
                      <span>{member.name}</span>
                    </div>

                    <div className="flex items-center">
                      {selectedUsers.some((user) => user.id === member.id) && <Check size={16} className="text-success" />}
                      {!isSearching && <span className="max-xs:hidden text-xs opacity-50 ml-3 mr-1">{index}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList> */}
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default AssignMembers;
