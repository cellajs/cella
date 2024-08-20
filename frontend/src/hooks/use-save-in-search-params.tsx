import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';

// This hook is used to save values in the URL search params
const useSaveInSearchParams = (
  values: Record<string, number | string | string[] | number[] | undefined>,
  defaultValues?: Record<string, string | undefined>,
) => {
  const navigate = useNavigate();
  const params = useParams({
    strict: false,
  });
  const currentSearchParams = useSearch({
    strict: false,
  });

  useEffect(() => {
    const searchParams = values;
    for (const key in searchParams) {
      if (
        (typeof defaultValues?.[key] !== 'undefined' && searchParams[key] === defaultValues?.[key]) ||
        currentSearchParams[key as keyof typeof currentSearchParams] === searchParams[key]
      )
        delete searchParams[key];
      if (searchParams[key] === '' || (Array.isArray(searchParams[key]) && searchParams[key]?.length === 0)) searchParams[key] = undefined;
      if (Array.isArray(searchParams[key]) && searchParams[key]?.length > 0)
        searchParams[key] = searchParams[key].length === 1 ? searchParams[key][0] : searchParams[key].join('_');
    }

    if (Object.keys(searchParams).length === 0) return;

    navigate({
      params,
      replace: true,
      search: (prev) => ({
        ...prev,
        ...searchParams,
      }),
    });
  }, [values, navigate]);
};

export default useSaveInSearchParams;
