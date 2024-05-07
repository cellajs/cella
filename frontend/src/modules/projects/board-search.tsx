import { Search, XCircle } from 'lucide-react';
import React, { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '~/modules/ui/input';
import { WorkspaceContext } from '../workspaces';

const BoardSearch = () => {
  const { t } = useTranslation();
  const { searchQuery, setSearchQuery, setSelectedTasks } = useContext(WorkspaceContext);

  // Reference with `useRef` to persist the same ref object during re-renders
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.focus();
  };

  return (
    <>
      <div className="relative flex w-full sm:min-w-44 items-center " onClick={handleClick} onKeyDown={undefined}>
        <Search size={16} className="absolute left-3" style={{ opacity: `${searchQuery.length ? 1 : 0.5}` }} />
        <Input
          placeholder={t('common:placeholder.search')}
          style={{ paddingLeft: '2rem' }}
          className="h-10 w-full"
          ref={inputRef}
          value={searchQuery}
          onChange={(e) => {
            const searchValue = e.target.value;
            if (searchValue.length) setSelectedTasks([]);
            setSearchQuery(searchValue);
          }}
        />
        {!!searchQuery.length && (
          <XCircle
            size={16}
            className="absolute right-3 top-1/2 opacity-70 hover:opacity-100 -translate-y-1/2 cursor-pointer"
            onClick={() => setSearchQuery('')}
          />
        )}
      </div>
    </>
  );
};

export default BoardSearch;
