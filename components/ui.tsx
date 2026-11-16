'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { APP_VERSION, STATUS_INFO } from '@/lib/config';
import { go } from '@/lib/nav';
import type { SetStatus } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

export function StatusChip({ status }: { status: SetStatus }) {
  const s = STATUS_INFO[status];
  return <span className={`inline-block whitespace-nowrap rounded-[10px] px-2.5 py-1 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

export function Spinner({ text = 'Đang tải…' }: { text?: string }) {
  return <div className="p-8 text-center text-sm text-muted">{text}</div>;
}

export function ErrorBox({ text }: { text: string }) {
  return <div className="rounded-xl border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{text}</div>;
}

export function TopBar({ title, sub, back, right }: { title: string; sub?: string; back?: string; right?: ReactNode }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-white px-3 py-2 pt-[calc(env(safe-area-inset-top)+8px)]">
      {back && (
        <button onClick={() => go(router, back)} aria-label="Quay lại" className="flex h-11 w-11 shrink-0 items-center justify-center text-ink">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
      )}
      <div className="min-w-0 flex-1 px-1">
        <div className="truncate text-[17px] font-bold">{title}</div>
        {sub && <div className="truncate text-xs text-muted">{sub}</div>}
      </div>
      {right}
    </header>
  );
}

export function Version({ className = '' }: { className?: string }) {
  return <span className={`text-[10px] ${className}`}>QA Photo {APP_VERSION}</span>;
}

export function AccountMenu() {
  const auth = useAuth();
  const router = useRouter();
  const logout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };
  return (
    <div className="flex items-center gap-2 text-sm">
      {auth.role === 'admin' && (
        <Link href="/admin" className="rounded-lg border border-line px-3 py-2 font-medium text-ink">
          Admin
        </Link>
      )}
      <button onClick={logout} className="rounded-lg border border-line px-3 py-2 text-muted">
        Đăng xuất
      </button>
    </div>
  );
}

export function AdminNav({ active }: { active: 'review' | 'final' | 'import' | 'cleanup' | 'defects' }) {
  const items = [
    { k: 'review', href: '/admin', t: 'Duyệt & xuất IE' },
    { k: 'final', href: '/admin/final', t: 'Final report' },
    { k: 'import', href: '/admin/import', t: 'Nhập recap' },
    { k: 'cleanup', href: '/admin/cleanup', t: 'Tải về & dọn ảnh' },
    { k: 'defects', href: '/admin/defects', t: 'Bảng lỗi' },
  ];
  const router = useRouter();
  const logout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };
  return (
    <div className="bg-ink text-white">
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
        <span className="flex items-baseline gap-2 text-lg font-bold">
          QA Photo <Version className="font-normal text-[#9AA5B1]" />
        </span>
        <nav className="flex flex-1 flex-wrap gap-1">
          {items.map((i) => (
            <Link
              key={i.k}
              href={i.href}
              className={`rounded-lg px-3 py-2 text-sm ${active === i.k ? 'bg-white font-semibold text-ink' : 'text-[#C9D1DB] hover:text-white'}`}
            >
              {i.t}
            </Link>
          ))}
        </nav>
        <Link href="/qa" className="text-sm text-[#C9D1DB] hover:text-white">
          Màn hình QA
        </Link>
        <button onClick={logout} className="text-sm text-[#C9D1DB] hover:text-white">
          Đăng xuất
        </button>
      </div>
    </div>
  );
}

export const btn = {
  primary: 'h-12 rounded-xl bg-brand px-4 text-[15px] font-semibold text-white disabled:opacity-40',
  ghost: 'h-12 rounded-xl border border-[#CBD2DA] bg-white px-4 text-[15px] font-semibold text-ink disabled:opacity-40',
  small: 'h-9 rounded-lg border border-[#CBD2DA] bg-white px-3 text-[13px] text-ink disabled:opacity-40',
  danger: 'h-9 rounded-lg border border-[#F1C4C4] bg-white px-3 text-[13px] text-bad disabled:opacity-40',
};

export function fmtDate(d: string | null) {
  if (!d) return '–';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y.slice(2)}`;
}

export function fmtMB(bytes: number) {
  return bytes >= 1024 * 1024 * 1024 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${Math.round(bytes / 1024 / 1024)} MB`;
}
