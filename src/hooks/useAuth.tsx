import { createContext, useContext, useEffect, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '../lib/api';

export interface Me { id: string; name: string; username: string; role: 'admin' | 'staff' }
const Ctx = createContext<{ user: Me | null; loading: boolean; logout: () => Promise<void> }>({ user: null, loading: true, logout: async () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me'], queryFn: () => get<{ user: Me }>('/auth/me').then((r) => r.user).catch(() => null), staleTime: 60_000 });
  useEffect(() => {
    const h = () => { qc.setQueryData(['me'], null); };
    window.addEventListener('auth:expired', h);
    return () => window.removeEventListener('auth:expired', h);
  }, [qc]);
  const logout = async () => { await post('/auth/logout'); qc.clear(); qc.setQueryData(['me'], null); };
  return <Ctx.Provider value={{ user: q.data ?? null, loading: q.isLoading, logout }}>{children}</Ctx.Provider>;
}
