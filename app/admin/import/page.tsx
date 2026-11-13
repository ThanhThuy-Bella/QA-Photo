'use client';
import { useState } from 'react';
import { useRequire } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/photos';
import { parseRecap, type RecapRow } from '@/lib/recap';
import type { JoColor } from '@/lib/types';
import { AdminNav, ErrorBox, Spinner, btn, fmtDate } from '@/components/ui';

interface Plan {
  rows: RecapRow[];
  added: RecapRow[];
  updated: RecapRow[];
  missing: JoColor[];
  fileName: string;
}

export default function ImportPage() {
  const auth = useRequire('admin');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErr('');
    setDone('');
    setPlan(null);
    setBusy('read');
    try {
      const rows = await parseRecap(f);
      if (!rows.length) throw new Error('Sheet "Prod" không có dòng dữ liệu nào.');
      const existing = await fetchAll<JoColor>('jo_colors');
      const ex = new Map(existing.map((r) => [`${r.jo_no}|${r.color_code}`, r]));
      const keys = new Set(rows.map((r) => `${r.jo_no}|${r.color_code}`));
      setPlan({
        rows,
        added: rows.filter((r) => !ex.has(`${r.jo_no}|${r.color_code}`)),
        updated: rows.filter((r) => ex.has(`${r.jo_no}|${r.color_code}`)),
        missing: existing.filter((r) => r.in_recap && !keys.has(`${r.jo_no}|${r.color_code}`)),
        fileName: f.name,
      });
    } catch (er) {
      setErr((er as Error).message);
    } finally {
      setBusy('');
    }
  };

  const apply = async () => {
    if (!plan) return;
    setBusy('save');
    setErr('');
    try {
      const now = new Date().toISOString();
      for (let i = 0; i < plan.rows.length; i += 500) {
        const chunk = plan.rows.slice(i, i + 500).map((r) => ({ ...r, in_recap: true, updated_at: now }));
        const { error } = await supabase.from('jo_colors').upsert(chunk, { onConflict: 'jo_no,color_code' });
        if (error) throw new Error(error.message);
      }
      const ids = plan.missing.map((m) => m.id);
      for (let i = 0; i < ids.length; i += 500) {
        const { error } = await supabase.from('jo_colors').update({ in_recap: false, updated_at: now }).in('id', ids.slice(i, i + 500));
        if (error) throw new Error(error.message);
      }
      await supabase.from('recap_imports').insert({
        file_name: plan.fileName,
        rows_total: plan.rows.length,
        added: plan.added.length,
        updated: plan.updated.length,
        missing: plan.missing.length,
      });
      setDone(`Đã cập nhật: ${plan.added.length} dòng mới, ${plan.updated.length} dòng cập nhật, ${plan.missing.length} dòng không còn trong recap (ảnh vẫn giữ).`);
      setPlan(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  if (!auth.ready) return <Spinner />;
  const jos = plan ? new Set(plan.rows.map((r) => r.jo_no)).size : 0;
  const styles = plan ? new Set(plan.rows.map((r) => r.cust_style)).size : 0;

  return (
    <main className="min-h-screen">
      <AdminNav active="import" />
      <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-4 py-5 md:px-6">
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
          <h1 className="text-lg font-bold">Nhập file Hazzys Order Recap</h1>
          <p className="max-w-[70ch] text-sm text-muted">
            App đọc sheet <b>Prod</b>: GO No, Cust. Style No, JO No, Color Code, Order Qty, Sewing Start Date, BPO Del Date, Style Desc(EN). Lot lấy từ đuôi
            JO (vd. 26M05665KR02 → KR02). Hàng MEN (kể cả outlet) là Men, còn lại (Ladies, Boys) là Ladies. Nhập lại file không xóa ảnh đã chụp.
          </p>
          <label className={`${btn.primary} flex w-fit cursor-pointer items-center`}>
            {busy === 'read' ? 'Đang đọc file…' : 'Chọn file recap (.xlsx)'}
            <input type="file" accept=".xlsx,.xlsm" className="hidden" onChange={onFile} disabled={!!busy} />
          </label>
          {err && <ErrorBox text={err} />}
          {done && <div className="rounded-xl border border-ok/30 bg-ok-soft p-3 text-sm text-ok">{done}</div>}
        </section>

        {plan && (
          <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
            <h2 className="font-bold">Kiểm tra trước khi cập nhật – {plan.fileName}</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {[
                ['Dòng JO × màu', plan.rows.length],
                ['JO', jos],
                ['Style', styles],
                ['Mới', plan.added.length],
                ['Không còn trong recap', plan.missing.length],
              ].map(([l, v]) => (
                <div key={l as string} className="rounded-lg bg-ground p-3">
                  <div className="text-xs text-muted">{l}</div>
                  <div className="text-xl font-bold">{v}</div>
                </div>
              ))}
            </div>
            {plan.missing.length > 0 && (
              <p className="text-sm text-warn">
                Các JO × màu không còn trong recap sẽ được đánh dấu, không xóa ảnh: {plan.missing.slice(0, 20).map((m) => `${m.jo_no}/${m.color_code}`).join(', ')}
                {plan.missing.length > 20 ? '…' : ''}
              </p>
            )}
            <div className="max-h-[360px] overflow-auto rounded-lg border border-line">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead className="sticky top-0 bg-[#F7F8FA] text-left text-muted">
                  <tr>
                    {['Style', 'JO', 'Lot', 'GO', 'Màu', 'SL', 'Ngày may', 'BPOD', 'Nhóm'].map((h) => (
                      <th key={h} className="px-2 py-2 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.slice(0, 300).map((r) => (
                    <tr key={`${r.jo_no}|${r.color_code}`} className="border-t border-[#EEF0F3]">
                      <td className="px-2 py-1.5">{r.cust_style}</td>
                      <td className="px-2 py-1.5">{r.jo_no}</td>
                      <td className="px-2 py-1.5">{r.lot}</td>
                      <td className="px-2 py-1.5">{r.go_no}</td>
                      <td className="px-2 py-1.5">{r.color_code}</td>
                      <td className="px-2 py-1.5">{r.order_qty}</td>
                      <td className="px-2 py-1.5">{fmtDate(r.sew_start)}</td>
                      <td className="px-2 py-1.5">{fmtDate(r.bpo_date)}</td>
                      <td className="px-2 py-1.5">{r.category}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <button onClick={apply} disabled={!!busy} className={btn.primary}>
                {busy === 'save' ? 'Đang cập nhật…' : 'Cập nhật vào app'}
              </button>
              <button onClick={() => setPlan(null)} disabled={!!busy} className={btn.ghost}>
                Hủy
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
