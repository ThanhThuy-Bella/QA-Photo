'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Role } from './types';

interface AuthState {
  loading: boolean;
  userId?: string;
  email?: string;
  role?: Role;
}

const Ctx = createContext<AuthState>({ loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ loading: true });

  useEffect(() => {
    let alive = true;
    const load = async (session: Session | null) => {
      if (!session) {
        if (alive) setState({ loading: false });
        return;
      }
      const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (alive) setState({ loading: false, userId: session.user.id, email: session.user.email, role: (data?.role as Role) || 'qa' });
    };
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setTimeout(() => load(s), 0);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}

/** Chuyển về /login nếu chưa đăng nhập; về /qa nếu trang yêu cầu admin. */
export function useRequire(role?: Role) {
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (auth.loading) return;
    if (!auth.userId) router.replace('/login');
    else if (role === 'admin' && auth.role !== 'admin') router.replace('/qa');
  }, [auth, role, router]);
  const ready = !auth.loading && !!auth.userId && (role !== 'admin' || auth.role === 'admin');
  return { ...auth, ready };
}
