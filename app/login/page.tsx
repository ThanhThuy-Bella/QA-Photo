'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginEmail, supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(user), password: pass });
    setBusy(false);
    if (error) setErr('Sai tài khoản hoặc mật khẩu.');
    else router.replace('/');
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-line bg-white p-6">
        <div>
          <h1 className="text-2xl font-bold">QA Photo</h1>
          <p className="text-sm text-muted">Chụp ảnh QA và báo cáo IE – THV</p>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Tài khoản
          <input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="QAinline hoặc email"
            className="h-12 rounded-xl border border-[#CBD2DA] px-3 text-base font-normal"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Mật khẩu
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="h-12 rounded-xl border border-[#CBD2DA] px-3 text-base font-normal"
            required
          />
        </label>
        {err && <p className="text-sm text-bad">{err}</p>}
        <button disabled={busy} className="h-12 rounded-xl bg-brand font-semibold text-white disabled:opacity-50">
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </main>
  );
}
