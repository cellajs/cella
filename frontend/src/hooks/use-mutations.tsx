import { type UseMutationOptions, type UseMutationResult, useMutation as useBaseMutation } from '@tanstack/react-query';
import type { ApiError } from '~/api';

export const useMutation = <TData = unknown, TError = ApiError, TVariables = void, TContext = unknown>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
): UseMutationResult<TData, TError, TVariables, TContext> => useBaseMutation<TData, TError, TVariables, TContext>(options);
