import { Search } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '~/modules/ui/input';

const BoardSearch = () => {
  const { t } = useTranslation();

  // Reference with `useRef` to persist the same ref object during re-renders
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.focus();
  };

  return (
    <>
      <div className="relative flex w-full sm:min-w-44 items-center " onClick={handleClick} onKeyDown={undefined}>
        <Search size={16} className="absolute left-3" style={{ opacity: 1 }} />
        <Input
          placeholder={t('common:placeholder.search')}
          value={'value'}
          style={{ paddingLeft: '2rem' }}
          className="h-10 w-full"
          ref={inputRef}
        />
      </div>
    </>
  );
};

export default BoardSearch;
