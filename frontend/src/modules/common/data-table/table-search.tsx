import { Search } from 'lucide-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '~/modules/ui/input';
function TableSearch({ query = '', setQuery }: { query?: string; setQuery: (value?: string) => void }) {
  const { t } = useTranslation();

  const [isFocused, setIsFocused] = useState(false);

  // Reference with `useRef` to persist the same ref object during re-renders
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const handleClick = () => {
    inputRef.current?.focus();
  };

  return (
    <>
      <div className="relative flex w-full sm:min-w-44 items-center " onClick={handleClick} onKeyDown={undefined}>
        <Search width="16" height="16" className="relative left-7 top-2 transform -translate-y-1/2" style={{ opacity: isFocused ? 1 : 0.5 }} />
        <Input
          placeholder={t('common:placeholder.search')}
          value={query} // Use value prop for controlled component
          onChange={(event) => setQuery(event.target.value)}
          style={{ paddingLeft: '2rem' }}
          className="h-10 w-full"
          onFocus={handleFocus}
          onBlur={handleBlur}
          ref={inputRef}
        />
      </div>
    </>
  );
}

export default TableSearch;
