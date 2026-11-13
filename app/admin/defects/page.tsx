'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRequire } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { DefectPosition, DefectType } from '@/lib/types';
import { AdminNav, ErrorBox, Spinner, btn } from '@/components/ui';

export default function DefectsAdmin() {
  const auth = useRequire('admin');
  const [types, setTypes] = useState<DefectType[] | null>(null);
  const [positions, setPositions] = useState<DefectPosition[]>([]);
  const [newType, setNewType] = useState('');
  const [newPos, setNewPos] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const [{ data: t, error }, { data: p }] = await Promise.all([
      supabase.from('defect_types').select('*').order('sort'),
      supabase.from('defect_positions').select('*').order('sort'),
    ]);
    if (error) setErr(error.message);
    setTypes((t || []) as DefectType[]);
    setPositions((p || []) as DefectPosition[]);
  }, []);

  useEffect(() => {
    if (auth.ready) load();
  }, [auth.ready, load]);

  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p;
    if (error) setErr(error.message);
    else {
      setErr('');
      load();
    }
  };

  const updType = (t: DefectType, patch: Partial<DefectType>) => {
    const next = { ...t, ...patch };
    if (!next.allow_critical && !next.allow_major && !next.allow_minor) return setErr('Mỗi lỗi phải có ít nhất 1 mức độ.');
    run(supabase.from('defect_types').update(patch).eq('id', t.id));
  };

  if (!auth.ready || !types) return <Spinner />;

  return (
    <main className="min-h-screen">
      <AdminNav active="defects" />
      <div className="mx-auto grid max-w-[1100px] gap-4 px-4 py-5 md:grid-cols-[2fr_1fr] md:px-6">
        {err && <div className="md:col-span-2"><ErrorBox text={err} /></div>}
        <section className="rounded-xl border border-line bg-white">
          <h1 className="border-b border-line p-4 font-bold">Tên lỗi và mức độ cho phép</h1>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead className="bg-[#F7F8FA] text-left text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Defect name</th>
                  <th className="px-2 py-2 text-center font-semibold">Critical</th>
                  <th className="px-2 py-2 text-center font-semibold">Major</th>
                  <th className="px-2 py-2 text-center font-semibold">Minor</th>
                  <th className="px-2 py-2 text-center font-semibold">Đang dùng</th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.id} className={`border-t border-[#EEF0F3] ${t.active ? '' : 'text-muted'}`}>
                    <td className="px-4 py-2">{t.name}</td>
                    {(['allow_critical', 'allow_major', 'allow_minor', 'active'] as const).map((k) => (
                      <td key={k} className="px-2 py-2 text-center">
                        <input type="checkbox" checked={t[k]} onChange={(e) => updType(t, { [k]: e.target.checked })} aria-label={`${t.name} ${k}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form
            className="flex gap-2 border-t border-line p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newType.trim()) return;
              run(supabase.from('defect_types').insert({ name: newType.trim(), sort: types.length + 1 }));
              setNewType('');
            }}
          >
            <input value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="Tên lỗi mới (tiếng Anh)" className="h-9 flex-1 rounded-lg border border-[#CBD2DA] px-2 text-[13px]" />
            <button className={btn.small}>Thêm lỗi</button>
          </form>
        </section>

        <section className="h-fit rounded-xl border border-line bg-white">
          <h2 className="border-b border-line p-4 font-bold">Vị trí lỗi</h2>
          <ul>
            {positions.map((p) => (
              <li key={p.id} className="flex items-center justify-between border-t border-[#EEF0F3] px-4 py-2 text-[13px] first:border-t-0">
                <span className={p.active ? '' : 'text-muted line-through'}>{p.name}</span>
                <button onClick={() => run(supabase.from('defect_positions').update({ active: !p.active }).eq('id', p.id))} className="text-xs text-brand">
                  {p.active ? 'Ẩn' : 'Dùng lại'}
                </button>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2 border-t border-line p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newPos.trim()) return;
              run(supabase.from('defect_positions').insert({ name: newPos.trim(), sort: positions.length + 1 }));
              setNewPos('');
            }}
          >
            <input value={newPos} onChange={(e) => setNewPos(e.target.value)} placeholder="Vị trí mới" className="h-9 flex-1 rounded-lg border border-[#CBD2DA] px-2 text-[13px]" />
            <button className={btn.small}>Thêm</button>
          </form>
        </section>
      </div>
    </main>
  );
}
