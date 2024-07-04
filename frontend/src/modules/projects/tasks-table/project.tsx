import { Check, ChevronDown } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Kbd } from '~/modules/common/kbd.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '~/modules/ui/command';
import { Button } from '~/modules/ui/button';
import type { Project } from '~/types';
import { AvatarWrap } from '~/modules/common/avatar-wrap';

interface Props {
  projects: Project[];
  selectedProjects: string[];
  setSelectedProjects: (projects: string[]) => void;
}

const SelectProject = ({ projects, selectedProjects, setSelectedProjects }: Props) => {
  const { t } = useTranslation();

  const [openPopover, setOpenPopover] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const isSearching = searchValue.length > 0;

  const handleSelectClick = (value: string) => {
    const existingProject = selectedProjects.find((p) => p === value);
    if (typeof existingProject !== 'undefined') {
      const updatedList = selectedProjects.filter((p) => p !== value);
      setSelectedProjects(updatedList);
      return;
    }
    const newProject = projects.find((p) => p.id === value);
    if (newProject) {
      const updatedList = [...selectedProjects, newProject.id];
      setSelectedProjects(updatedList);
      return;
    }
  };

  // TODO prevent search results from blick
  useMemo(() => {
    const project = projects.find((p) => p.name === searchValue);
    if (!project) return;
    handleSelectClick(project.id);
    setSearchValue('');
    return;
  }, [searchValue]);

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
                return (
                  <div key={currentProject.id} className="flex items-center gap-3">
                    <AvatarWrap
                      type="USER"
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
            onValueChange={setSearchValue}
            clearValue={setSearchValue}
            className="leading-normal"
            placeholder={t('common:placeholder.select_project')}
          />
          {!isSearching && <Kbd value="A" className="absolute top-3 right-2.5" />}
          <CommandList>
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
                      <AvatarWrap type="USER" id={project.id} name={project.name} url={project.thumbnailUrl} className="h-6 w-6 text-xs" />
                      <span>{project.name}</span>
                    </div>
                    <div className="flex items-center">
                      {selectedProjects.some((p) => p === project.id) && <Check size={16} className="text-success" />}
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

export default SelectProject;
