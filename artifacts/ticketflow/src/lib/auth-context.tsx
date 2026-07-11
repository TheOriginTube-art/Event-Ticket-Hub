import { createContext, useContext, type ReactNode } from "react";
import {
  useGetMe,
  useLogin,
  useLogout,
  useRegister,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import type { AuthUser } from "@workspace/api-zod";
import { useQueryClient } from "@tanstack/react-query";

type AuthContextValue = {
  user: AuthUser | undefined;
  isLoading: boolean;
  login: (input: { email: string; password: string }) => Promise<AuthUser>;
  register: (input: { email: string; password: string; name: string }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  loginError: string | null;
  registerError: string | null;
  isAuthenticating: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false },
  });

  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const logoutMutation = useLogout();

  const login: AuthContextValue["login"] = async (input) => {
    const result = await loginMutation.mutateAsync({ data: input });
    queryClient.setQueryData(getGetMeQueryKey(), result);
    return result;
  };

  const register: AuthContextValue["register"] = async (input) => {
    const result = await registerMutation.mutateAsync({ data: input });
    queryClient.setQueryData(getGetMeQueryKey(), result);
    return result;
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
    queryClient.setQueryData(getGetMeQueryKey(), undefined);
    await queryClient.invalidateQueries();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        logout,
        loginError: loginMutation.error ? extractErrorMessage(loginMutation.error) : null,
        registerError: registerMutation.error ? extractErrorMessage(registerMutation.error) : null,
        isAuthenticating: loginMutation.isPending || registerMutation.isPending,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data: unknown }).data;
    if (data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string") {
      return (data as { error: string }).error;
    }
  }
  return "Что-то пошло не так. Попробуйте еще раз.";
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
