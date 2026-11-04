import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type Viewer } from './api';
const AuthContext = createContext<{
  user: Viewer | null;
  loading: boolean;
  error: Error | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  retry: () => void;
} | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const me = useQuery({
    queryKey: ['auth'],
    queryFn: async () => {
      try {
        return (await api<{ user: Viewer }>('/auth/me')).user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 60000,
  });
  useEffect(() => {
    const expire = () => {
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
      client.setQueryData(['auth'], null);
    };
    window.addEventListener('agro-session-expired', expire);
    return () => window.removeEventListener('agro-session-expired', expire);
  }, [client]);
  async function login(email: string, password: string) {
    const result = await api<{ user: Viewer }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    client.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    client.setQueryData(['auth'], result.user);
  }
  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    client.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    client.setQueryData(['auth'], null);
  }
  return (
    <AuthContext.Provider
      value={{
        user: me.data ?? null,
        loading: me.isPending,
        error: me.error,
        login,
        logout,
        retry: () => {
          void me.refetch();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider ausente');
  return value;
}
