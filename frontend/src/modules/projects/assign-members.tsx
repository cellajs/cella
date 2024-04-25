import { type ReactNode, useEffect, useState } from 'react';
import { Button } from '~/modules/ui/button';
import { Check } from 'lucide-react';
import type { User } from '~/mocks/dataGeneration.ts';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.tsx';
import { CommandItem, CommandList, Command, CommandInput, CommandGroup } from '../ui/command.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.tsx';
import { Kbd } from '../common/kbd.tsx';
import { AvatarWrap } from '../common/avatar-wrap.tsx';

const defaultMembers = [
  { bio: 'poor advocate, photographer 👕', id: '9a4630c1-5036-4cdf-a521-c0dee7f48304', name: 'Alton Labadie', thumbnailUrl: null },
  { bio: 'agent advocate', id: 'e128c479-7618-477d-8f8f-9fb9b8e6587f', name: 'Jane Balistreri', thumbnailUrl: null },
  { bio: 'blogger, environmentalist', id: '41e8c32e-188e-4f9d-bb10-c90dfdc25e68', name: 'Karla Jacobson', thumbnailUrl: null },
  { bio: 'scientist', id: 'ae8e81ea-8880-439a-ac00-ef4c81d17177', name: 'Rudy Cole', thumbnailUrl: null },
  { bio: 'entrepreneur', id: 'cda6e97e-07a9-4b90-9b71-b5f6cd85c944', name: 'Leticia Grimes', thumbnailUrl: null },
];

const AssignMembers = ({
  members = defaultMembers,
  mode,
  passedChild,
  changeAssignTo,
}: { members?: User[]; mode: 'create' | 'reassign'; passedChild?: ReactNode; changeAssignTo?: (users: User[]) => void }) => {
  const isToolTipOpen = mode === 'create' ? false : true;
  const [openPopover, setOpenPopover] = useState(isToolTipOpen);
  const [openTooltip, setOpenTooltip] = useState(isToolTipOpen);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [searchValue, setSearchValue] = useState('');

  const handleSelectClick = (name: string) => {
    if (!name) return;
    const existingUser = selectedUsers.find((user) => user.name === name);
    if (existingUser) {
      setSelectedUsers(selectedUsers.filter((user) => user.name !== name));
      return;
    }
    const newUser = members.find((user) => user.name === name);
    if (newUser) {
      setSelectedUsers([...selectedUsers, newUser]);
      return;
    }
  };

  const isSearching = searchValue.length > 0;

  useEffect(() => {
    if (changeAssignTo && selectedUsers.length > 0) changeAssignTo(selectedUsers);
  }, [selectedUsers]);
  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <Tooltip delayDuration={500} open={openTooltip} onOpenChange={setOpenTooltip}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            {passedChild ? (
              passedChild
            ) : (
              <Button aria-label="Set impacts" variant="ghost" size={'sm'} className="w-full text-left flex gap-2 justify-start border">
                {selectedUsers.length < 1 ? (
                  <AvatarWrap type="USER" className="h-6 w-6 text-xs" />
                ) : (
                  selectedUsers.map((user) => {
                    return <AvatarWrap type="USER" id={user.id as string} name={user.name} url={user.thumbnailUrl} className="h-6 w-6 text-xs" />;
                  })
                )}
                Assign members
              </Button>
            )}
          </PopoverTrigger>
        </TooltipTrigger>
        {!passedChild && (
          <TooltipContent
            hideWhenDetached
            side="bottom"
            align="start"
            sideOffset={6}
            className="flex items-center gap-2 bg-background border text-xs px-2 h-8"
          >
            <span className="text-primary">Assign to</span>
            <Kbd value="A" />
          </TooltipContent>
        )}
      </Tooltip>
      <PopoverContent className="w-200 p-0 rounded-lg" align="end" onCloseAutoFocus={(e) => e.preventDefault()} sideOffset={6}>
        <Command className="relative rounded-lg">
          <CommandInput
            value={searchValue}
            onValueChange={(searchValue) => {
              // If the user types a number, select the user like useHotkeys
              if ([0, 1, 2, 3, 4, 5, 6].includes(Number.parseInt(searchValue))) {
                handleSelectClick(defaultMembers[Number.parseInt(searchValue)]?.name);
                setOpenTooltip(false);
                setOpenPopover(false);
                setSearchValue('');
                return;
              }
              setSearchValue(searchValue);
            }}
            clearValue={setSearchValue}
            className="leading-normal"
            placeholder="Assign to..."
          />
          {!isSearching && <Kbd value="A" className="absolute top-3 right-[10px]" />}
          <CommandList>
            <CommandGroup>
              {members.map((member, index) => (
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
                    <AvatarWrap type="USER" id={member.id as string} name={member.name} url={member.thumbnailUrl} className="h-6 w-6 text-xs" />
                    <span>{member.name}</span>
                  </div>

                  <div className="flex items-center">
                    {selectedUsers.includes(member) && <Check size={16} className="text-success" />}
                    {!isSearching && <span className="max-xs:hidden text-xs opacity-50 ml-3 mr-1">{index}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default AssignMembers;
