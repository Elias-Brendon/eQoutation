import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type {
  AuthStatus,
  AuthUser,
  ChangePasswordInput,
  LoginInput,
  RecoveryQuestionResult,
  ResetPasswordInput,
  SetSecurityQuestionInput,
  SetupInput
} from '@shared/types/entities'

export const authStatusQueryKey = ['authStatus'] as const

export function useAuthStatus(): UseQueryResult<AuthStatus> {
  return useQuery({
    queryKey: authStatusQueryKey,
    queryFn: () => window.api.auth.getStatus()
  })
}

export function useSetup(): UseMutationResult<AuthUser, Error, SetupInput> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input) => window.api.auth.setup(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authStatusQueryKey })
  })
}

export function useLogin(): UseMutationResult<AuthUser, Error, LoginInput> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input) => window.api.auth.login(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authStatusQueryKey })
  })
}

export function useLogout(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => window.api.auth.logout(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authStatusQueryKey })
  })
}

export function useRecoveryQuestion(): UseMutationResult<RecoveryQuestionResult, Error, string> {
  return useMutation({
    mutationFn: (username) => window.api.auth.getRecoveryQuestion(username)
  })
}

export function useResetPassword(): UseMutationResult<AuthUser, Error, ResetPasswordInput> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input) => window.api.auth.resetPassword(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authStatusQueryKey })
  })
}

export function useSetSecurityQuestion(): UseMutationResult<
  void,
  Error,
  SetSecurityQuestionInput
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input) => window.api.auth.setSecurityQuestion(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authStatusQueryKey })
  })
}

export function useChangePassword(): UseMutationResult<void, Error, ChangePasswordInput> {
  return useMutation({
    mutationFn: (input) => window.api.auth.changePassword(input)
  })
}
