import { type FullSearchSchema, type RegisteredRouter, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
import { objectKeys } from '~/lib/object';

type SearchParams = Pick<FullSearchSchema<RegisteredRouter['routeTree']>, 'sort' | 'order' | 'q' | 'role'>;

// This hook is used to save values in the URL search params
const useSaveInSearchParams = (values: SearchParams, defaultValues?: SearchParams) => {
  const navigate = useNavigate();
  //Strict false is needed because can be used at any route
  const params = useParams({
    strict: false,
  });
  const currentSearchParams = useSearch({
    strict: false,
  });

  useEffect(() => {
    let searchParams = { ...values };
    for (const key of objectKeys(searchParams)) {
      if (searchParams[key] === '' || searchParams[key] === undefined) {
        const defaultValue = defaultValues?.[key];
        if (defaultValue !== '' && defaultValue !== undefined) {
          searchParams = {
            ...searchParams,
            [key]: defaultValue,
          };
        } else {
          delete searchParams[key];
        }
      }
      if (currentSearchParams[key] === searchParams[key]) {
        delete searchParams[key];
      }
      if (searchParams[key] === '' || (Array.isArray(searchParams[key]) && searchParams[key]?.length === 0)) {
        searchParams[key] = undefined;
      }
      if (Array.isArray(searchParams[key]) && searchParams[key]?.length > 0) {
        searchParams[key] = searchParams[key].length === 1 ? searchParams[key][0] : searchParams[key].join('_');
      }
    }

    if (Object.keys(searchParams).length === 0) return;

    navigate({
      replace: true,
      params,
      to: '.',
      search: (prev) => ({
        ...prev,
        ...searchParams,
      }),
    });
  }, [values, navigate]);
};

export default useSaveInSearchParams;
