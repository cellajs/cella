import { ArchiveIcon, ChevronDownIcon, PlusIcon, Settings2, XCircleIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useRef, useState } from 'react';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import type { UserMenuItem } from '~/modules/me/types';
import { Button } from '~/modules/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '~/modules/ui/input-group';
import { Switch } from '~/modules/ui/switch';
import { cn } from '~/utils/cn';
import type { UserMenu } from './data';

interface MockMenuSheetProps {
  initialMenu?: UserMenu;
}

export function MockMenuSheet({ initialMenu }: MockMenuSheetProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [keepMenuOpen, setKeepMenuOpen] = useState(false);
  const [detailedMenu, setDetailedMenu] = useState(false);
  const [offlineAccess, setOfflineAccess] = useState(false);
  const [isSectionVisible, setIsSectionVisible] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isArchivedVisible, setIsArchivedVisible] = useState(false);

  const createButtonRef = useRef(null);

  // Filter organizations based on search
  const filteredOrganizations = useMemo(() => {
    if (!searchTerm.trim() || !initialMenu?.organization) return [];

    const lowerCaseTerm = searchTerm.toLowerCase();
    return initialMenu.organization.filter((org) => org.name.toLowerCase().includes(lowerCaseTerm));
  }, [searchTerm, initialMenu]);

  const hasOrganizations = initialMenu?.organization && initialMenu.organization.length > 0;
  const activeOrganizations = initialMenu?.organization?.filter((org) => !org.membership.archived) || [];
  const archivedOrganizations = initialMenu?.organization?.filter((org) => org.membership.archived) || [];

  const toggleIsEditing = () => setIsEditing(!isEditing);
  const archiveToggleClick = () => setIsArchivedVisible(!isArchivedVisible);
  const handleCreateAction = () => {
    // Mock create action
    console.log('Create organization clicked');
  };

  return (
    <div className="w-80 h-screen bg-background border-r">
      <div id="nav-sheet-viewport" className="h-full overflow-y-auto">
        <div className="group/menu w-full py-3 px-3 gap-1 max-sm:pt-0 min-h-[calc(100vh-0.5rem)] flex flex-col">
          {/* Search Input */}
          <InputGroup className="z-20 border-0 shadow-none max-sm:hidden">
            <InputGroupInput
              id="nav-sheet-search"
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search"
            />
            <InputGroupAddon className="pl-1.5">
              <div className="w-4 h-4" />
            </InputGroupAddon>
            <InputGroupAddon className="pr-2" align="inline-end">
              <XCircleIcon
                size={16}
                className={cn('opacity-70 hover:opacity-100 cursor-pointer', searchTerm ? 'block' : 'hidden')}
                onClick={() => setSearchTerm('')}
              />
            </InputGroupAddon>
          </InputGroup>

          {/* Search Results */}
          {searchTerm && (
            <div className="mt-3 flex flex-col gap-1 group-data-[search=false]/menu:hidden">
              {filteredOrganizations.length > 0 ? (
                filteredOrganizations.map((item) => <MockMenuItem key={item.id} item={item} searchResults />)
              ) : (
                <div className="text-sm text-muted-foreground p-2">No results found for "{searchTerm}"</div>
              )}
            </div>
          )}

          {/* Menu Content */}
          {!searchTerm && hasOrganizations && (
            <div className="mt-3 flex flex-col gap-1">
              {/* Section Header */}
              <div className="flex items-center gap-2 z-10 py-3 pb-1 bg-background justify-between">
                <Button onClick={() => setIsSectionVisible(!isSectionVisible)} className="w-full justify-between" variant="secondary" asChild>
                  <motion.button layout={'size'} transition={{ bounce: 0, duration: 0.2 }}>
                    <div className="flex items-center">
                      <motion.span layout={'size'} className="flex items-center">
                        Organizations
                      </motion.span>
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="inline-block group-data-[visible=true]/menuSection:hidden px-2 py-1 text-xs font-light text-muted-foreground"
                      >
                        {activeOrganizations.length}
                      </motion.span>
                    </div>

                    <motion.div initial={{ rotate: 0 }} transition={{ duration: 0.2 }}>
                      <ChevronDownIcon size={16} className="opacity-50 group-data-[visible=true]/menuSection:rotate-180" />
                    </motion.div>
                  </motion.button>
                </Button>

                <AnimatePresence mode="popLayout">
                  {isSectionVisible && activeOrganizations.length && (
                    <Button
                      className="w-12 px-2 max-sm:hidden"
                      variant={isEditing ? 'plain' : 'secondary'}
                      size="icon"
                      onClick={() => toggleIsEditing()}
                      asChild
                    >
                      <motion.button
                        key={`sheet-menu-settings-organization`}
                        transition={{ bounce: 0, duration: 0.2 }}
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 20, opacity: 0, transition: { bounce: 0, duration: 0.1 } }}
                      >
                        <Settings2 size={16} />
                      </motion.button>
                    </Button>
                  )}
                </AnimatePresence>

                <AnimatePresence mode="popLayout">
                  {isSectionVisible && (
                    <Button
                      ref={createButtonRef}
                      className="w-12 px-2 max-sm:hidden"
                      variant="secondary"
                      size="icon"
                      onClick={() => handleCreateAction()}
                      asChild
                    >
                      <motion.button
                        key={`sheet-menu-plus-organization`}
                        transition={{ bounce: 0, duration: 0.2 }}
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 20, opacity: 0 }}
                      >
                        <PlusIcon size={16} />
                      </motion.button>
                    </Button>
                  )}
                </AnimatePresence>
              </div>

              {/* Active Organizations */}
              <AnimatePresence initial={false}>
                {isSectionVisible && (
                  <motion.ul
                    key="organization"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    style={{ overflow: 'hidden' }}
                  >
                    {activeOrganizations.map((item) => (
                      <MockMenuItem key={item.id} item={item} />
                    ))}

                    {/* Archived Section */}
                    {!!activeOrganizations.length && (
                      <div
                        className="group/archived"
                        data-has-archived={!!archivedOrganizations.length}
                        data-submenu={false}
                        data-archived-visible={isArchivedVisible}
                      >
                        {(!!archivedOrganizations.length || isEditing) && (
                          <MockSectionArchiveButton archiveToggleClick={archiveToggleClick} archivedCount={archivedOrganizations.length} />
                        )}
                        <AnimatePresence initial={false}>
                          {isArchivedVisible && (
                            <motion.ul
                              key="organization-archived"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2, ease: 'easeInOut' }}
                              style={{ overflow: 'hidden' }}
                            >
                              {archivedOrganizations.map((item) => (
                                <MockMenuItem key={item.id} item={item} />
                              ))}
                            </motion.ul>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Empty State */}
          {!searchTerm && !hasOrganizations && <div className="text-sm text-muted-foreground p-2">No organizations found</div>}

          {/* Settings */}
          {!searchTerm && (
            <>
              <div className="grow mt-4 border-b border-dashed" />
              <div className="flex flex-col mt-6 mb-3 mx-2 gap-4">
                <div className="flex items-center gap-4 ml-1">
                  <Switch id="keepMenuOpen" checked={keepMenuOpen} onCheckedChange={setKeepMenuOpen} />
                  <label htmlFor="keepMenuOpen" className="cursor-pointer select-none text-sm font-medium leading-none">
                    Keep menu open
                  </label>
                </div>

                <div className="flex items-center gap-4 ml-1">
                  <Switch id="offlineAccess" checked={offlineAccess} onCheckedChange={setOfflineAccess} />
                  <label htmlFor="offlineAccess" className="cursor-pointer select-none text-sm font-medium leading-none">
                    Offline access
                  </label>
                </div>

                <div className="flex items-center gap-4 ml-1">
                  <Switch id="detailedMenu" checked={detailedMenu} onCheckedChange={setDetailedMenu} />
                  <label htmlFor="detailedMenu" className="cursor-pointer select-none text-sm font-medium leading-none">
                    Detailed menu
                  </label>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Mock Menu Item Component
function MockMenuItem({ item, searchResults = false }: { item: UserMenuItem; searchResults?: boolean }) {
  const isSubitem = !searchResults && !item.submenu;

  return (
    <div
      data-subitem={isSubitem}
      className={cn(
        'relative group/menuItem h-12 w-full flex items-start justify-start space-x-1 rounded-sm p-0 focus:outline-hidden ring-2 ring-inset ring-transparent focus-visible:ring-foreground sm:hover:bg-accent/30 sm:hover:text-accent-foreground data-[subitem=true]:h-10 cursor-pointer',
        'data-[link-active=true]:ring-transparent active:translate-y-[.05rem] transition-all',
      )}
    >
      <span className="absolute left-0 top-3 h-[calc(100%-1.5rem)] w-1 rounded-lg bg-primary transition-opacity opacity-0 group-hover/menuItem:opacity-100" />
      <AvatarWrap
        className="z-1 items-center m-2 mx-3 text-sm group-hover/menuItem:font-bold group-data-[subitem=true]/menuItem:my-2 group-data-[subitem=true]/menuItem:mx-4 group-data-[subitem=true]/menuItem:text-xs size-8 group-active/menuItem:translate-y-[.05rem] group-data-[subitem=true]/menuItem:size-6"
        type={item.entityType}
        id={item.id}
        name={item.name}
        url={item.thumbnailUrl}
      />
      <div className="truncate grow flex flex-col justify-center pr-2 text-left group-data-[subitem=true]/menuItem:pl-0">
        <div
          className={cn(
            'truncate leading-5 transition-spacing text-md group-hover/menuItem:delay-300 pt-1 duration-100 ease-in-out',
            !searchResults && 'pt-3.5 group-data-[subitem=true]/menuItem:pt-2',
            searchResults ? '' : isSubitem ? 'sm:group-hover/menuItem:pt-[0.06rem]!' : 'sm:group-hover/menuItem:pt-[0.3rem]!',
            'group-data-[subitem=true]/menuItem:text-sm group-data-[subitem=true]/menuItem:font-light',
          )}
        >
          {item.name}
        </div>
        <div className="text-muted-foreground text-xs">
          {searchResults && (
            <span>
              {item.entityType}
              <span className="transition-opacity duration-100 ease-in-out opacity-0 group-hover/menuItem:delay-300 sm:group-hover/menuItem:opacity-100 mx-2">
                ·
              </span>
            </span>
          )}
          <span className="opacity-0 transition-opacity duration-100 ease-in-out group-hover/menuItem:delay-300 pointer-events-none sm:group-hover/menuItem:opacity-100">
            {item.membership.role}
          </span>
        </div>
      </div>
    </div>
  );
}

// Mock Section Archive Button Component
function MockSectionArchiveButton({ archiveToggleClick, archivedCount }: { archiveToggleClick: () => void; archivedCount: number }) {
  return (
    <motion.div layout>
      <Button
        onClick={archiveToggleClick}
        disabled={archivedCount < 1}
        variant="secondary"
        className="w-full group bg-background p-0 transition duration-300 focus-visible:outline-hidden ring-inset focus-visible:ring-offset-0 focus-visible:ring-foreground hover:bg-accent/50 hover:text-accent-foreground
        group-data-[submenu=true]/archived:h-8"
      >
        <div className="w-12 py-2 flex justify-center items-center">
          <ArchiveIcon size={16} className="ml-2 items-center opacity-75" />
        </div>
        <div className="truncate grow text-left p-2 pl-2 opacity-75">
          <span className="text-sm group-data-[submenu=true]/archived:text-xs">Archived</span>
          <span
            className="inline-block px-2 py-1 font-light text-xs text-muted-foreground 
          group-data-[archived-visible=true]/archived:hidden"
          >
            {archivedCount}
          </span>
        </div>
        <div className="px-3">
          <ChevronDownIcon
            size={16}
            className="transition-transform opacity-50 
              group-data-[has-inactive=false]/archived:hidden
              group-data-[archived-visible=true]/archived:rotate-180"
          />
        </div>
      </Button>
    </motion.div>
  );
}
