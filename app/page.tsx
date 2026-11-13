'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui';

export default function Home() {
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (auth.loading) return;
    if (!auth.userId) router.replace('/login');
    else router.replace(auth.role === 'admin' ? '/admin' : '/qa');
  }, [auth, router]);
  return <Spinner />;
}
