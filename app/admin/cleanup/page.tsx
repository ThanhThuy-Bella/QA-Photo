'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { useRequire } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { deletePhotos, downloadPhoto, fetchAll } from '@/lib/photos';
import { buildIEWorkbook, ieFileBase, loadIEData, type IEItem } from '@/lib/exportIE';
import { downloadBlob } from '@/lib/image';
import { RETENTION_MONTHS, STORAGE_LIMIT_BYTES } from '@/lib/config';
import type { JoColor, Photo, PhotoSet } from '@/lib/types';
import { AdminNav, ErrorBox, Spinner, StatusChip, btn, fmtDate, fmtMB } from '@/components/ui';

interface Item {
  set: PhotoSet;
  row?: JoColor;
  photos: Photo[];
  bytes: number;
  last: string;
  overdue: boolean;
}

function safe(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, '_');
}

export default function CleanupPage() {
  const auth = useRequire('admin');
  const [items, setItems] = useState<Item[] | null>(null);
  const [fronts, setFronts] = useState<Photo[]>([]);
  const [total, setTotal] = useState(0);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [zipped, setZipped] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const [sets, photos, rows] = await Promise.all([
        fetchAll<PhotoSet>('photo_sets'),
        fetchAll<Photo>('photos'),
        fetchAll<JoColor>('jo_colors'),
      ]);
      setTotal(photos.reduce((n, p) => n + (p.size_bytes || 0), 0));
      setFronts(photos.filter((p) => p.set_id === null));
      const rowMap = new Map(rows.map((r) => [`${r.jo_no}|${r.color_code}`, r]));
      const limit = new Date();
      limit.setMonth(limit.getMonth() - RETENTION_MONTHS);
      const out: Item[] = sets
        .filter((s) => s.status !== 'archived')
        .map((s) => {
          const ps = photos.filter((p) => p.set_id === s.id);
          const last = ps.reduce((m, p) => (p.created_at > m ? p.created_at : m), s.updated_at);
          return { set: s, row: rowMap.get(`${s.jo_no}|${s.color_code}`), photos: ps, bytes: ps.reduce((n, p) => n + (p.size_bytes || 0), 0), last, overdue: new Date(last) < limit };
        })
        .filter((i) => i.photos.length > 0)
        .sort((a, b) => a.last.localeCompare(b.last));
      setItems(out);
      setChecked(new Set(out.filter((i) => i.overdue).map((i) => i.set.id)));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (auth.ready) load();
  }, [auth.ready, load]);

  const selected = useMemo(() => (items || []).filter((i) => checked.has(i.set.id)), [items, checked]);

  /** Ảnh thân trước chỉ xóa khi mọi bộ ảnh cùng style × màu đều được dọn. */
  const frontsToRemove = useMemo(() => {
    const sel = new Set(selected.map((i) => i.set.id));
    return fronts.filter((f) => {
      const others = (items || []).filter((i) => i.row?.cust_style === f.cust_style && i.set.color_code === f.color_code && !sel.has(i.set.id));
      return others.length === 0;
    });
  }, [selected, fronts, items]);

  const selBytes = selected.reduce((n, i) => n + i.bytes, 0) + frontsToRemove.reduce((n, p) => n + (p.size_bytes || 0), 0);

  const makeZip = async () => {
    if (!selected.length) return;
    setBusy('zip');
    setErr('');
    try {
      const zip = new JSZip();
      let n = 0;
      const all = selected.reduce((c, i) => c + i.photos.length, 0) + frontsToRemove.length;
      for (const it of selected) {
        const style = it.row?.cust_style || 'NO_STYLE';
        const folder = `${safe(style)}/${safe(it.row?.lot || '')}_${safe(it.set.jo_no)}/${safe(it.set.color_code)}`;
        const cnt: Record<string, number> = {};
        for (const p of it.photos) {
          cnt[p.kind] = (cnt[p.kind] || 0) + 1;
          const extra = p.kind === 'defect' ? `_${safe(`${p.defect_name}-${p.severity}-${p.position}`)}` : '';
          setMsg(`Đang nén ảnh ${++n}/${all}…`);
          zip.file(`${folder}/${p.kind}${extra}_${cnt[p.kind]}.jpg`, await downloadPhoto(p.path));
        }
      }
      for (const f of frontsToRemove) {
        setMsg(`Đang nén ảnh ${++n}/${all}…`);
        zip.file(`${safe(f.cust_style)}/_than_truoc/${safe(f.color_code)}_${f.id}.jpg`, await downloadPhoto(f.path));
      }
      // Kèm file Excel IE cho các bộ ảnh đã duyệt, đủ ảnh
      const byStyle = new Map<string, IEItem[]>();
      selected.forEach((i) => {
        const ok = i.set.status === 'approved' && i.photos.some((p) => p.kind === 'label') && i.photos.some((p) => p.kind === 'fold');
        if (!ok || !i.row) return;
        if (!byStyle.has(i.row.cust_style)) byStyle.set(i.row.cust_style, []);
        byStyle.get(i.row.cust_style)!.push({ jo: i.set.jo_no, lot: i.row.lot, color: i.set.color_code, setId: i.set.id });
      });
      for (const [style, its] of byStyle) {
        setMsg(`Đang tạo Excel IE ${style}…`);
        const sheets = await loadIEData(its);
        zip.file(`${safe(style)}/${ieFileBase(style, sheets)}.xlsx`, await buildIEWorkbook(style, sheets));
      }
      setMsg('Đang đóng gói ZIP…');
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `QA_Photo_luu_tru_${new Date().toISOString().slice(0, 10)}.zip`);
      setZipped(new Set(selected.map((i) => i.set.id)));
      setMsg('Đã tải file ZIP. Mở file kiểm tra xong rồi bấm "Xóa khỏi cloud".');
    } catch (e) {
      setErr((e as Error).message);
      setMsg('');
    } finally {
      setBusy('');
    }
  };

  const allZipped = selected.length > 0 && selected.every((i) => zipped.has(i.set.id));

  const purge = async () => {
    if (!allZipped || !window.confirm(`Xóa vĩnh viễn ${selected.length} bộ ảnh (${fmtMB(selBytes)}) khỏi cloud? Hãy chắc chắn file ZIP đã lưu an toàn.`)) return;
    setBusy('purge');
    setErr('');
    try {
      await deletePhotos([...selected.flatMap((i) => i.photos), ...frontsToRemove]);
      const ids = selected.map((i) => i.set.id);
      const { error } = await supabase.from('photo_sets').update({ status: 'archived', updated_at: new Date().toISOString() }).in('id', ids);
      if (error) throw new Error(error.message);
      setMsg(`Đã dọn ${selected.length} bộ ảnh, giải phóng ${fmtMB(selBytes)}.`);
      setZipped(new Set());
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  if (!auth.ready) return <Spinner />;
  const pct = Math.min(100, Math.round((total / STORAGE_LIMIT_BYTES) * 100));
  const overdue = (items || []).filter((i) => i.overdue).length;

  return (
    <main className="min-h-screen">
      <AdminNav active="cleanup" />
      <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-4 py-5 md:px-6">
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-lg font-bold">Dung lượng ảnh</h1>
            <span className="text-sm text-muted">
              {fmtMB(total)} / 1 GB (gói miễn phí)
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-[#E6E9ED]">
            <div className={`h-3 ${pct >= 90 ? 'bg-bad' : pct >= 80 ? 'bg-[#D97706]' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="max-w-[75ch] text-sm text-muted">
            Chọn bộ ảnh → <b>Tải ZIP</b> (ảnh theo thư mục Style / Lot_JO / Màu, kèm Excel IE của bộ đã duyệt) → kiểm tra file → <b>Xóa khỏi cloud</b>. Bộ ảnh
            quá {RETENTION_MONTHS} tháng được chọn sẵn{overdue ? ` (${overdue} bộ)` : ''}.
          </p>
          {err && <ErrorBox text={err} />}
          {msg && <div className="rounded-xl border border-brand/20 bg-brand-soft p-3 text-sm text-brand-dark">{msg}</div>}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">
              Đã chọn {selected.length} bộ · {fmtMB(selBytes)}
            </span>
            <span className="flex-1" />
            <button onClick={makeZip} disabled={!selected.length || !!busy} className={btn.primary}>
              {busy === 'zip' ? 'Đang tạo ZIP…' : '1. Tải ZIP'}
            </button>
            <button onClick={purge} disabled={!allZipped || !!busy} className="h-12 rounded-xl bg-bad px-4 text-[15px] font-semibold text-white disabled:opacity-40">
              {busy === 'purge' ? 'Đang xóa…' : '2. Xóa khỏi cloud'}
            </button>
          </div>
        </section>

        <section className="overflow-x-auto rounded-xl border border-line bg-white">
          {!items ? (
            <Spinner />
          ) : (
            <table className="w-full min-w-[720px] text-[13px]">
              <thead className="bg-[#F7F8FA] text-left text-muted">
                <tr>
                  <th className="w-10 px-3 py-2" />
                  {['Style', 'Lot', 'JO', 'Màu', 'Số ảnh', 'Dung lượng', 'Ảnh mới nhất', 'Trạng thái'].map((h) => (
                    <th key={h} className="px-2 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.set.id} className={`border-t border-[#EEF0F3] ${i.overdue ? 'bg-bad-soft/50' : ''}`}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={checked.has(i.set.id)}
                        onChange={() =>
                          setChecked((p) => {
                            const n = new Set(p);
                            if (n.has(i.set.id)) n.delete(i.set.id);
                            else n.add(i.set.id);
                            return n;
                          })
                        }
                        aria-label={`Chọn ${i.set.jo_no} ${i.set.color_code}`}
                      />
                    </td>
                    <td className="px-2 py-2 font-semibold">{i.row?.cust_style || '–'}</td>
                    <td className="px-2 py-2">{i.row?.lot || '–'}</td>
                    <td className="px-2 py-2">{i.set.jo_no}</td>
                    <td className="px-2 py-2">{i.set.color_code}</td>
                    <td className="px-2 py-2">{i.photos.length}</td>
                    <td className="px-2 py-2">{fmtMB(i.bytes)}</td>
                    <td className="px-2 py-2">
                      {fmtDate(i.last)}
                      {i.overdue && <span className="ml-1 text-[11px] font-semibold text-bad">quá {RETENTION_MONTHS} tháng</span>}
                    </td>
                    <td className="px-2 py-2">
                      <StatusChip status={i.set.status} />
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-muted">
                      Chưa có ảnh nào trên cloud.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
