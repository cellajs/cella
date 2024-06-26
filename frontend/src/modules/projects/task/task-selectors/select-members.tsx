import { Check, UserX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
// import { useHotkeys } from '~/hooks/use-hot-keys.ts';
import { useMeasure } from '~/hooks/use-measure.tsx';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { AvatarGroup, AvatarGroupList, AvatarOverflowIndicator } from '~/modules/ui/avatar';
import { Button } from '~/modules/ui/button';
import type { Member } from '~/types/index.ts';
import { Kbd } from '../../../common/kbd.tsx';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '../../../ui/command.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../../../ui/popover.tsx';

interface AssignMembersProps {
  mode: 'create' | 'edit';
  users: Member[];
  viewValue?: Member[] | null;
  changeAssignedTo?: (users: Member[]) => void;
}

const AssignMembers = ({ users, mode, viewValue, changeAssignedTo }: AssignMembersProps) => {
  // const { project } = useContext(ProjectContext);
  const { t } = useTranslation();
  const { ref, bounds } = useMeasure();
  const formValue = useFormContext?.()?.getValues('assignedTo');

  const [openPopover, setOpenPopover] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Member[]>(viewValue ? viewValue : formValue || []);
  const [searchValue, setSearchValue] = useState('');

  const isSearching = searchValue.length > 0;

  const handleSelectClick = (id: string) => {
    if (!id) return;
    const existingUser = selectedUsers.find((user) => user.id === id);
    if (existingUser) {
      setSelectedUsers(selectedUsers.filter((user) => user.id !== id));
      return;
    }
    const newUser = users.find((user) => user.id === id);
    if (newUser) {
      setSelectedUsers([...selectedUsers, newUser]);
      return;
    }
  };
  // Open on key press
  // useHotkeys([
  //   [
  //     'a',
  //     () => {
  //       if (focusedTaskId === task.id) setOpenPopover(true);
  //     },
  //   ],
  // ]);

  useEffect(() => {
    if (changeAssignedTo && JSON.stringify(selectedUsers) !== JSON.stringify(viewValue)) changeAssignedTo(selectedUsers);
  }, [selectedUsers]);

  // Whenever the form value changes (also on reset), update the internal state
  useEffect(() => {
    if (mode === 'edit') return;
    setSelectedUsers(formValue || []);
  }, [formValue]);

  // watch for changes in the viewValue
  useEffect(() => {
    if (mode === 'create') return;
    setSelectedUsers(viewValue || []);
  }, [viewValue]);

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <PopoverTrigger asChild>
        <Button
          ref={ref as React.LegacyRef<HTMLButtonElement>}
          aria-label="Assign"
          variant="ghost"
          size={mode === 'create' ? 'sm' : 'xs'}
          className={`flex justify-start font-light ${
            mode === 'create' ? 'w-full text-left border' : 'group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 opacity-70'
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
          <CommandList>
            {users && (
              <CommandGroup>
                {users.map((user, index) => (
                  <CommandItem
                    key={user.id}
                    value={user.id}
                    onSelect={(id) => {
                      handleSelectClick(id);
                      setSearchValue('');
                    }}
                    className="group rounded-md flex justify-between items-center w-full leading-normal"
                  >
                    <div className="flex items-center gap-3">
                      <AvatarWrap type="USER" id={user.id} name={user.name} url={user.thumbnailUrl} className="h-6 w-6 text-xs" />
                      <span>{user.name}</span>
                    </div>

                    <div className="flex items-center">
                      {selectedUsers.some((u) => u.id === user.id) && <Check size={16} className="text-success" />}
                      {!isSearching && <span className="max-xs:hidden text-xs opacity-50 ml-3 mr-1">{index}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default AssignMembers;
