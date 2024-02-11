import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

const useSaveInSearchParams = (
  values: {
    key: string;
    value: string | undefined;
  }[],
) => {
  const navigate = useNavigate();

  useEffect(() => {
    const searchParams = values.reduce(
      (acc, { key, value }) => {
        acc[key] = value || undefined;

        return acc;
      },
      {} as Record<string, string | undefined>,
    );

    console.log('searchParams', searchParams);

    navigate({
      params: {},
      search: (prev) => ({
        ...prev,
        ...searchParams,
      }),
    });
  }, [values, navigate]);
};

export default useSaveInSearchParams;
