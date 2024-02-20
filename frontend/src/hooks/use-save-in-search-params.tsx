import { useNavigate, useParams } from '@tanstack/react-router';
import { useEffect } from 'react';

const useSaveInSearchParams = (values: Record<string, string | undefined>, defaultValues?: Record<string, string | undefined>) => {
  const navigate = useNavigate();
  const params = useParams({
    strict: false,
  });

  useEffect(() => {
    const searchParams = values;

    // if (defaultValues && Object.entries(searchParams).every(([key, value]) => defaultValues[key] === value)) {
    //   console.log('reset');
    //   navigate({
    //     params: {},
    //     replace: true,
    //   });
    //   return;
    // }

    for (const key in searchParams) {
      if (typeof defaultValues?.[key] !== 'undefined' && searchParams[key] === defaultValues?.[key]) {
        delete searchParams[key];
      }
      if (searchParams[key] === '') {
        searchParams[key] = undefined;
      }
    }

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
