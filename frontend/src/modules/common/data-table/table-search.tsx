import { Search } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '~/modules/ui/input';

const TableSearch = ({ value = '', setQuery }: { value?: string; setQuery: (value: string) => void }) => {
  const { t } = useTranslation();

  // Reference with `useRef` to persist the same ref object during re-renders
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.focus();
  };

  return (
    <>
      <div className="relative flex w-full sm:min-w-44 items-center " onClick={handleClick} onKeyDown={undefined}>
        <Search size={16} className="relative left-7 top-2 transform -translate-y-1/2" style={{ opacity: value ? 1 : 0.5 }} />
        <Input
          placeholder={t('common:placeholder.search')}
          value={value}
          onChange={(event) => setQuery(event.target.value)}
          style={{ paddingLeft: '2rem' }}
          className="h-10 w-full"
          ref={inputRef}
        />
      </div>
    </>
  );
};

export default TableSearch;
