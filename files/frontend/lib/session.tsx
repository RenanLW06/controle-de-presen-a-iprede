'use client';
import { createContext, useContext } from 'react';

export interface User { id: string; name: string; role: 'admin' | 'monitor' }
export const SessionContext = createContext<{ user: User; logout: () => void } | null>(null);
export const useSession = () => {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession fora do SessionContext');
  return s;
};
