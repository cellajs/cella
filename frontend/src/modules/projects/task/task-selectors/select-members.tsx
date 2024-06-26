import { Check } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
// import { useHotkeys } from '~/hooks/use-hot-keys.ts';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import type { Member } from '~/types/index.ts';
import { Kbd } from '~/modules/common/kbd.tsx';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '../../../ui/command.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../../../ui/popover.tsx';
import { useDebounce } from '~/hooks/use-debounce.tsx';

interface AssignMembersProps {
  users: Member[];
  value: Member[];
  children: React.ReactNode;
  changeAssignedTo: (users: Member[]) => void;
  triggerWidth?: number;
}

const AssignMembers = ({ users, children, value, changeAssignedTo, triggerWidth = 240 }: AssignMembersProps) => {
  const { t } = useTranslation();

  const [openPopover, setOpenPopover] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Member[]>(value);
  const [searchValue, setSearchValue] = useState('');
  const debouncedSearchQuery = useDebounce(searchValue, 300);

  const isSearching = searchValue.length > 0;
  const indexArray = [...Array(users.length).keys()];

  const handleSelectClick = (id: string) => {
    if (!id) return;
    const existingUser = selectedUsers.find((user) => user.id === id);
    if (existingUser) {
      const updatedList = selectedUsers.filter((user) => user.id !== id);
      setSelectedUsers(updatedList);
      changeAssignedTo(updatedList);
      return;
    }
    const newUser = users.find((user) => user.id === id);
    if (newUser) {
      const updatedList = [...selectedUsers, newUser];
      setSelectedUsers(updatedList);
      changeAssignedTo(updatedList);
      return;
    }
  };

  // TODO prevent search results from blick
  useMemo(() => {
    if (!indexArray.includes(Number.parseInt(debouncedSearchQuery))) return;
    handleSelectClick(users[Number.parseInt(searchValue)]?.id);
    setSearchValue('');
    return;
  }, [debouncedSearchQuery]);

  // Open on key press
  // useHotkeys([
  //   [
  //     'a',
  //     () => {
  //       if (focusedTaskId === task.id) setOpenPopover(true);
  //     },
  //   ],
  // ]);

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>

      <PopoverContent
        style={{ width: `${triggerWidth}px` }}
        className="p-0 rounded-lg"
        align="end"
        onCloseAutoFocus={(e) => e.preventDefault()}
        sideOffset={4}
      >
        <Command className="relative rounded-lg">
          <CommandInput
            value={searchValue}
            onValueChange={setSearchValue}
            clearValue={setSearchValue}
            className="leading-normal"
            placeholder={t('common:placeholder.assign')}
          />
          {!isSearching && <Kbd value="A" className="absolute top-3 right-2.5" />}
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
