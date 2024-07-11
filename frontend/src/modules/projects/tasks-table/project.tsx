import { Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Kbd } from '~/modules/common/kbd.tsx';
import { Button } from '~/modules/ui/button';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandEmpty } from '~/modules/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import type { Project } from '~/types';
import { inNumbersArray } from '../task/task-selectors/helpers';

interface Props {
  projects: Project[];
  selectedProjects: string[];
  setSelectedProjects: (projects: string[]) => void;
}

const SelectProject = ({ projects, selectedProjects, setSelectedProjects }: Props) => {
  const { t } = useTranslation();

  const [openPopover, setOpenPopover] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const handleSelectClick = (value: string) => {
    const existingProject = selectedProjects.find((p) => p === value);
    if (typeof existingProject !== 'undefined') return setSelectedProjects(selectedProjects.filter((p) => p !== value));

    const newProject = projects.find((p) => p.id === value);
    if (newProject) return setSelectedProjects([...selectedProjects, newProject.id]);
  };

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <PopoverTrigger asChild>
        <Button
          aria-label="Select Status"
          variant="ghost"
          size="sm"
          className="flex justify-start gap-2 group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 opacity-70"
        >
          {selectedProjects.length ? (
            <div className="flex items-center gap-1">
              {selectedProjects.map((projectId) => {
                const currentProject = projects.find((p) => p.id === projectId);
                if (!currentProject) return null;
                if (selectedProjects.length > 1)
                  return (
                    <AvatarWrap
                      type="project"
                      id={currentProject.id}
                      name={currentProject.name}
                      url={currentProject.thumbnailUrl}
                      className="h-6 w-6"
                    />
                  );
                return (
                  <div key={currentProject.id} className="flex items-center gap-3">
                    <AvatarWrap
                      type="project"
                      id={currentProject.id}
                      name={currentProject.name}
                      url={currentProject.thumbnailUrl}
                      className="h-6 w-6 text-xs"
                    />
                    <span>{currentProject.name}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {t('common:project')}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </div>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="p-0 rounded-lg" align="end" onCloseAutoFocus={(e) => e.preventDefault()} sideOffset={4}>
        <Command className="relative rounded-lg">
          <CommandInput
            value={searchValue}
            onValueChange={(searchValue) => {
              // If the user types a number, select status like useHotkeys
              if (inNumbersArray(projects.length, searchValue)) return handleSelectClick(projects[Number.parseInt(searchValue) - 1].id);
              setSearchValue(searchValue);
            }}
            clearValue={setSearchValue}
            className="leading-normal"
            placeholder={t('common:placeholder.select_project')}
          />
          {!searchValue.length && <Kbd value="P" className="absolute top-3 right-2.5" />}
          <CommandList>
            {!!searchValue.length && (
              <CommandEmpty className="flex justify-center items-center p-2 text-sm">
                {t('common:no_resource_found', { resource: t('common:status').toLowerCase() })}
              </CommandEmpty>
            )}
            {projects && (
              <CommandGroup>
                {projects.map((project, index) => (
                  <CommandItem
                    key={project.id}
                    value={project.id}
                    onSelect={() => {
                      handleSelectClick(project.id);
                    }}
                    className="group rounded-md flex justify-between items-center w-full leading-normal"
                  >
                    <div className="flex items-center gap-3">
                      <AvatarWrap type="project" id={project.id} name={project.name} url={project.thumbnailUrl} className="h-6 w-6 text-xs" />
                      <span>{project.name}</span>
                    </div>
                    <div className="flex items-center">
                      {selectedProjects.some((p) => p === project.id) && <Check size={16} className="text-success" />}
                      {!searchValue.length && <span className="max-xs:hidden text-xs opacity-50 ml-3 mr-1">{index + 1}</span>}
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

export default SelectProject;
