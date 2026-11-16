'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRequire } from '@/lib/auth';
import { fetchAll } from '@/lib/photos';
import { summarize, type JoSummary } from '@/lib/joSummary';
import type { JoColor, PhotoSet } from '@/lib/types';
import { AccountMenu, ErrorBox, Spinner, StatusChip, fmtDate } from '@/components/ui';

type Tab = 'doing' | 'rejected' | 'approved';

export default function QaList() {
  const auth = useRequire();
  const [list, setList] = useState<JoSummary[] | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>('doing');
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!auth.ready) return;
    (async () => {
      try {
        const [rows, sets, photos] = await Promise.all([
          fetchAll<JoColor>('jo_colors'),
          fetchAll<PhotoSet>('photo_sets'),
          fetchAll<{ id: number; set_id: number | null; kind: string; cust_style: string; color_code: string }>('photos', 'id,set_id,kind,cust_style,color_code', (x) => x.in('kind', ['label', 'fold'])),
        ]);
        setList(summarize(rows, sets, photos));
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, [auth.ready]);

  const counts = useMemo(() => {
    const c = { doing: 0, rejected: 0, approved: 0 };
    list?.forEach((j) => {
      if (j.status === 'archived') return;
      if (j.status === 'rejected') c.rejected++;
      else if (j.status === 'approved') c.approved++;
      else c.doing++;
    });
    return c;
  }, [list]);

  const shown = useMemo(() => {
    const s = q.trim().toUpperCase();
    return (list || []).filter((j) => {
      if (j.status === 'archived') return false;
      const t = j.status === 'rejected' ? 'rejected' : j.status === 'approved' ? 'approved' : 'doing';
      if (t !== tab) return false;
      if (!s) return true;
      return [j.style, j.jo, j.go || '', ...j.colors.map((c) => c.color)].some((x) => x.toUpperCase().includes(s));
    });
  }, [list, tab, q]);

  if (!auth.ready) return <Spinner />;

  const tabs: { k: Tab; t: string }[] = [
    { k: 'doing', t: `Đang làm (${counts.doing})` },
    { k: 'rejected', t: `Bị trả lại (${counts.rejected})` },
    { k: 'approved', t: `Đã duyệt (${counts.approved})` },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-[640px] flex-col">
      <div className="flex flex-col gap-3.5 bg-ink px-5 pb-4 pt-[calc(env(safe-area-inset-top)+16px)] text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-[#C9D1DB]">QA ngoài chuyền · THV</div>
            <h1 className="text-xl font-bold">Ảnh cần chụp</h1>
          </div>
          <div className="[&_a]:border-[#3A4654] [&_a]:text-white [&_button]:border-[#3A4654] [&_button]:text-[#C9D1DB]">
            <AccountMenu />
          </div>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm style, JO, GO, màu…"
          className="h-11 rounded-xl border-0 bg-ink2 px-3 text-[15px] text-white placeholder:text-[#9AA5B1]"
        />
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`h-[34px] shrink-0 rounded-full px-3.5 text-[13px] ${tab === t.k ? 'bg-white font-semibold text-ink' : 'border border-[#3A4654] text-white'}`}
            >
              {t.t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {err && <ErrorBox text={err} />}
        {!list && !err && <Spinner />}
        {list && shown.length === 0 && (
          <p className="p-6 text-center text-sm text-muted">
            {list.length === 0 ? 'Chưa có dữ liệu. Admin cần nhập file recap trước.' : 'Không có JO nào trong mục này.'}
          </p>
        )}
        {shown.map((j) => (
          <Link key={j.jo} href={`/qa/${encodeURIComponent(j.jo)}`} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-white p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-base font-bold">
                  {j.style} · {j.lot}
                </div>
                <div className="truncate text-xs text-muted">
                  {j.jo} · GO {j.go || '–'} · {j.category} · May {fmtDate(j.sewStart)}
                </div>
              </div>
              <StatusChip status={j.status} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {j.colors.map((c) => (
                <span
                  key={c.color}
                  className={`rounded-lg px-2 py-1 text-xs font-medium ${c.ieDone === 2 ? 'bg-ok-soft text-ok' : 'bg-[#EEF0F3] text-[#3A4654]'}`}
                >
                  {c.color}
                  {c.ieDone === 2 ? ' ✓' : ''}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2.5">
              <div className="h-1.5 flex-1 overflow-hidden rounded bg-[#E6E9ED]">
                <div className="h-1.5 bg-brand" style={{ width: `${j.ieTotal ? Math.round((j.ieDone / j.ieTotal) * 100) : 0}%` }} />
              </div>
              <span className="text-xs text-muted">
                {j.ieDone}/{j.ieTotal} ảnh IE
              </span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
