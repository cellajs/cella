import { useLocation } from '@tanstack/react-router';
import { Check, XCircle } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { updateTask } from '~/api/tasks';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { dropdowner } from '~/modules/common/dropdowner/state';
import { Kbd } from '~/modules/common/kbd';
import { inNumbersArray } from '~/modules/tasks/helpers';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '~/modules/ui/command';
import { Input } from '~/modules/ui/input';
import { useWorkspaceQuery } from '~/modules/workspaces/use-workspace';
import { useWorkspaceStore } from '~/store/workspace';
import type { User } from '~/types/common';

type AssignableMember = Omit<User, 'counts'>;

interface AssignMembersProps {
  value: AssignableMember[];
  projectId: string;
  triggerWidth?: number;
  creationValueChange?: (users: AssignableMember[]) => void;
}

const AssignMembers = ({ projectId, value, creationValueChange, triggerWidth = 320 }: AssignMembersProps) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { focusedTaskId } = useWorkspaceStore();
  const {
    data: { workspace, members },
  } = useWorkspaceQuery();
  const [selectedMembers, setSelectedMembers] = useState<AssignableMember[]>(value);
  const [searchValue, setSearchValue] = useState('');
  const [showAll, setShowAll] = useState(false);
  const isMobile = useBreakpoints('max', 'sm');
  const inputRef = useRef<HTMLInputElement>(null);

  const projectMembers = members.filter((m) => m.membership.projectId === projectId);

  const sortedMembers = [...projectMembers].sort((a, b) => {
    const aSelected = selectedMembers.some((user) => user.id === a.id) ? 1 : 0;
    const bSelected = selectedMembers.some((user) => user.id === b.id) ? 1 : 0;
    return bSelected - aSelected;
  });

  const showedMembers = useMemo(() => {
    if (searchValue.length) return sortedMembers.filter((m) => m.name.toLowerCase().includes(searchValue.toLowerCase()));
    if (showAll) return sortedMembers;
    return sortedMembers.slice(0, 6);
  }, [showAll, searchValue, sortedMembers]);

  const changeAssignedTo = async (members: AssignableMember[]) => {
    if (!focusedTaskId) return;
    try {
      const updatedTask = await updateTask(
        focusedTaskId,
        workspace.organizationId,
        'assignedTo',
        members.map((user) => user.id),
      );
      const eventName = pathname.includes('/board') ? 'taskOperation' : 'taskTableOperation';
      dispatchCustomEvent(eventName, { array: [updatedTask], action: 'update', projectId: updatedTask.projectId });
    } catch (err) {
      toast.error(t('common:error.update_resource', { resource: t('app:task') }));
    }
  };

  const handleSelectClick = (id: string) => {
    if (!id) return;
    setSearchValue('');
    dropdowner.remove();
    const existingUser = selectedMembers.find((user) => user.id === id);
    if (existingUser) {
      const updatedList = selectedMembers.filter((user) => user.id !== id);
      setSelectedMembers(updatedList);
      if (creationValueChange) return creationValueChange(updatedList);
      return changeAssignedTo(updatedList);
    }
    const newUser = projectMembers.find((m: { id: string }) => m.id === id);
    if (newUser) {
      const updatedList = [...selectedMembers, newUser];
      setSelectedMembers(updatedList);
      if (creationValueChange) return creationValueChange(updatedList);
      changeAssignedTo(updatedList);
      return;
    }
  };

  return (
    <Command className="relative rounded-lg max-h-[44vh] overflow-y-auto" style={{ width: `${triggerWidth}px` }}>
      <Input
        ref={inputRef}
        className="leading-normal focus-visible:ring-transparent border-t-0 border-x-0 border-b-1 rounded-none max-sm:hidden min-h-10"
        placeholder={t('app:placeholder.assign')}
        value={searchValue}
        autoFocus={true}
        onChange={(e) => {
          const searchValue = e.target.value;
          // If the user types a number, select status like useHotkeys
          if (!showAll && inNumbersArray(6, searchValue)) return handleSelectClick(projectMembers[Number.parseInt(searchValue) - 1]?.id);
          setSearchValue(searchValue);
        }}
      />

      {!searchValue.length ? (
        <Kbd value="A" className="max-sm:hidden absolute top-3 right-2.5" />
      ) : (
        <XCircle
          size={16}
          className="absolute top-5 right-2.5 opacity-70 hover:opacity-100 -translate-y-1/2 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            setSearchValue('');
          }}
        />
      )}

      <CommandList>
        {!!searchValue.length && (
          <CommandEmpty className="flex justify-center items-center p-2 text-sm">
            {t('common:no_resource_found', { resource: t('common:members').toLowerCase() })}
          </CommandEmpty>
        )}
        {showedMembers && (
          <CommandGroup>
            {showedMembers.map((user, index) => (
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
                  <Check size={16} className={`text-success ${!selectedMembers.some((u) => u.id === user.id) && 'invisible'}`} />
                  {!searchValue.length && !showAll && <span className="max-sm:hidden text-xs opacity-50 ml-3 mr-1">{index + 1}</span>}
                </div>
              </CommandItem>
            ))}
            {showedMembers.length > 5 && !searchValue.length && (
              <CommandItem
                className="flex items-center justify-center opacity-80 hover:opacity-100"
                onSelect={() => {
                  setShowAll(!showAll);
                  if (inputRef.current && !isMobile) inputRef.current.focus();
                }}
              >
                <span className="text-xs">{showAll ? t('common:show_less') : t('common:show_all')}</span>
              </CommandItem>
            )}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
};

export default AssignMembers;
