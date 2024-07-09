import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { dropdowner } from '~/modules/common/dropdowner/state';
import { Kbd } from '~/modules/common/kbd.tsx';
import type { Member } from '~/types/index.ts';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../../../ui/command.tsx';

interface AssignMembersProps {
  users: Member[];
  value: Member[];
  changeAssignedTo: (users: Member[]) => void;
  triggerWidth?: number;
}

const AssignMembers = ({ users, value, changeAssignedTo, triggerWidth = 240 }: AssignMembersProps) => {
  const { t } = useTranslation();

  const [selectedUsers, setSelectedUsers] = useState<Member[]>(value);
  const [searchValue, setSearchValue] = useState('');

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

  useMemo(() => {
    if (!indexArray.includes(Number.parseInt(searchValue))) return;
    handleSelectClick(users[Number.parseInt(searchValue)]?.id);
    setSearchValue('');
    dropdowner.remove();
    return;
  }, [searchValue]);

  return (
    <Command className="relative rounded-lg" style={{ width: `${triggerWidth}px` }}>
      <CommandInput
        autoFocus={true}
        value={searchValue}
        onValueChange={setSearchValue}
        clearValue={setSearchValue}
        className="leading-normal"
        placeholder={t('common:placeholder.assign')}
      />
      {!isSearching && <Kbd value="A" className="absolute top-3 right-2.5" />}
      <CommandList>
        {!!searchValue.length && (
          <CommandEmpty className="flex justify-center items-center p-2 text-sm">
            {t('common:no_resource_found', { resource: t('common:members').toLowerCase() })}
          </CommandEmpty>
        )}
        {users && (
          <CommandGroup>
            {users.map((user, index) => (
              <CommandItem
                key={user.id}
                value={user.id}
                onSelect={(id) => {
                  handleSelectClick(id);
                  dropdowner.remove();
                  setSearchValue('');
                }}
                className="group rounded-md flex justify-between items-center w-full leading-normal"
              >
                <div className="flex items-center gap-3">
                  <AvatarWrap type="user" id={user.id} name={user.name} url={user.thumbnailUrl} className="h-6 w-6 text-xs" />
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
  );
};

export default AssignMembers;
