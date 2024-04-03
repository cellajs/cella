import {debounce} from '@github/mini-throttle';
import { Search } from 'lucide-react';
import type { ChangeEvent } from 'react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '~/modules/ui/input';
function TableSearch({ query, setQuery }: { query?: string; setQuery: (value?: string) => void }) {
  const { t } = useTranslation();

  const [isFocused, setIsFocused] = useState(false);
  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const handleClick = () => {
    inputRef.current?.focus();
  };

  const inputRef = React.createRef<HTMLInputElement>();
  return (
    <>
      <div className="relative flex items-center max-w-2xl " onClick={handleClick} onKeyDown={undefined}>
        <Search width="16" height="16" className="relative left-7 top-2 transform -translate-y-1/2" style={{ opacity: isFocused ? 1 : 0.5 }} />
        <Input
          placeholder={t('common:placeholder.search')}
          defaultValue={query}
          onChange={debounce((event: ChangeEvent<HTMLInputElement>) => {
            setQuery(event.target.value);
          }, 200)}
          style={{ paddingLeft: '2rem' }}
          className="h-10 w-[150px] lg:w-[250px]"
          onFocus={handleFocus}
          onBlur={handleBlur}
          ref={inputRef}
        />
      </div>
    </>
  );
}

export default TableSearch;
