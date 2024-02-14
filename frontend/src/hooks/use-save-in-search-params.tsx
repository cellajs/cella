import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

const useSaveInSearchParams = (values: Record<string, string | undefined>, defaultValues?: Record<string, string | undefined>) => {
  const navigate = useNavigate();

  useEffect(() => {
    const searchParams = values;

    if (defaultValues && Object.entries(defaultValues).every(([key, value]) => searchParams[key] === value)) {
      navigate({
        params: {},
        replace: true,
      });
      return;
    }

    navigate({
      params: {},
      replace: true,
      search: (prev) => ({
        ...prev,
        ...searchParams,
      }),
    });
  }, [values, navigate]);
};

export default useSaveInSearchParams;
