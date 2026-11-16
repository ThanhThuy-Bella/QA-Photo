'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRequire } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { fetchAll, signedUrls } from '@/lib/photos';
import { exportIE, type IEItem } from '@/lib/exportIE';
import { KIND_INFO, STORAGE_LIMIT_BYTES, STATUS_INFO } from '@/lib/config';
import type { JoColor, Photo, PhotoKind, PhotoSet, SetStatus } from '@/lib/types';
import { AdminNav, ErrorBox, Spinner, StatusChip, btn, fmtDate, fmtMB } from '@/components/ui';
import { Lightbox } from '@/components/Lightbox';
import { ALERT_CLS, bpoAlert, type BpoAlert } from '@/lib/bpo';
import { BPO_ALERT_DAYS, BPO_SEND_DAYS } from '@/lib/config';

interface Row extends JoColor {
  set?: PhotoSet;
  status: SetStatus;
  ie: number;
  key: string;
  alert: BpoAlert | null;
}

type PhotoLite = Pick<Photo, 'id' | 'set_id' | 'kind' | 'size_bytes' | 'cust_style' | 'color_code'>;

export default function AdminReview() {
  const auth = useRequire('admin');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [storage, setStorage] = useState(0);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState<'live' | 'alert' | SetStatus>('live');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Row | null>(null);
  const [selPhotos, setSelPhotos] = useState<Photo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const [view, setView] = useState<{ src: string; cap: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [jc, sets, photos] = await Promise.all([
        fetchAll<JoColor>('jo_colors'),
        fetchAll<PhotoSet>('photo_sets'),
        fetchAll<PhotoLite>('photos', 'id,set_id,kind,size_bytes,cust_style,color_code'),
      ]);
      const setMap = new Map(sets.map((s) => [`${s.jo_no}|${s.color_code}`, s]));
      const ie = new Map<number, Set<string>>();
      let total = 0;
      photos.forEach((p) => {
        total += p.size_bytes || 0;
        if (p.set_id && (p.kind === 'label' || p.kind === 'fold')) {
          if (!ie.has(p.set_id)) ie.set(p.set_id, new Set());
          ie.get(p.set_id)!.add(p.kind);
        }
      });
      setStorage(total);
      const sharedFold = new Set(photos.filter((p) => p.set_id === null && p.kind === 'fold').map((p) => `${p.cust_style}|${p.color_code}`));
      const out: Row[] = [];
      jc.forEach((r) => {
        const key = `${r.jo_no}|${r.color_code}`;
        const set = setMap.get(key);
        if (!r.in_recap && !set) return;
        const status = set?.status || 'draft';
        const own = set ? ie.get(set.id) : undefined;
        const ieN = Number(!!own?.has('label')) + Number(!!own?.has('fold') || sharedFold.has(`${r.cust_style}|${r.color_code}`));
        out.push({ ...r, set, status, ie: ieN, key, alert: bpoAlert(r.bpo_date, status) });
      });
      out.sort((a, b) => a.cust_style.localeCompare(b.cust_style) || a.lot.localeCompare(b.lot) || a.jo_no.localeCompare(b.jo_no) || a.color_code.localeCompare(b.color_code));
      setRows(out);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (auth.ready) load();
  }, [auth.ready, load]);

  const openRow = async (r: Row) => {
    setSel(r);
    setReason(r.set?.reject_reason || '');
    setSelPhotos([]);
    const list: Photo[] = [];
    if (r.set) {
      const { data } = await supabase.from('photos').select('*').eq('set_id', r.set.id).order('created_at');
      list.push(...((data || []) as Photo[]));
    }
    const { data: f } = await supabase.from('photos').select('*').is('set_id', null).eq('cust_style', r.cust_style).eq('color_code', r.color_code).order('created_at');
    list.push(...((f || []) as Photo[]));
    setSelPhotos(list);
    setUrls(await signedUrls(list.map((p) => p.path)));
  };

  const shown = useMemo(() => {
    const s = q.trim().toUpperCase();
    return (rows || []).filter((r) => {
      if (fStatus === 'alert') {
        if (!r.alert) return false;
      } else if (fStatus === 'live' ? r.status === 'archived' : r.status !== fStatus) return false;
      if (!s) return true;
      return [r.cust_style, r.jo_no, r.go_no || '', r.color_code, r.lot].some((x) => x.toUpperCase().includes(s));
    });
  }, [rows, q, fStatus]);

  const alerts = useMemo(
    () => (rows || []).filter((r) => r.alert).sort((a, b) => a.alert!.daysToSend - b.alert!.daysToSend || (a.bpo_date || '').localeCompare(b.bpo_date || '')),
    [rows],
  );
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);

  // Hàng duyệt: bộ chờ duyệt, gấp nhất (theo hạn gửi buyer) lên trước
  const reviewQueue = useMemo(
    () =>
      (rows || [])
        .filter((r) => r.status === 'submitted')
        .sort((a, b) => (a.alert?.daysToSend ?? 99) - (b.alert?.daysToSend ?? 99) || (a.bpo_date || '9999').localeCompare(b.bpo_date || '9999')),
    [rows],
  );

  const kpi = useMemo(() => {
    const c = { submitted: 0, draft: 0, approved: 0, rejected: 0 };
    rows?.forEach((r) => {
      if (r.status in c) c[r.status as keyof typeof c]++;
    });
    return c;
  }, [rows]);

  const setStatus = async (ids: number[], status: SetStatus, rejectReason: string | null) => {
    const { error } = await supabase
      .from('photo_sets')
      .update({ status, reject_reason: rejectReason, reviewed_at: new Date().toISOString(), reviewed_by: auth.userId, updated_at: new Date().toISOString() })
      .in('id', ids);
    if (error) throw new Error(error.message);
  };

  // Duyệt lần lượt: đóng bộ hiện tại → tự mở bộ chờ duyệt tiếp theo
  useEffect(() => {
    if (!reviewing || sel || !rows) return;
    const next = reviewQueue[0];
    if (next) void openRow(next);
    else setReviewing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewing, sel, rows, reviewQueue]);

  // Tự cập nhật khi QA gửi duyệt (Supabase Realtime) + làm mới định kỳ 60 giây
  useEffect(() => {
    if (!auth.ready) return;
    const ch = supabase
      .channel('admin-photo-sets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photo_sets' }, (payload) => {
        const n = payload.new as Partial<PhotoSet> | null;
        const o = payload.old as Partial<PhotoSet> | null;
        if (n?.status === 'submitted' && o?.status !== 'submitted') {
          const id = Date.now() + Math.random();
          setToasts((t) => [...t, { id, text: `QA vừa gửi duyệt ${n.jo_no} · ${n.color_code}` }]);
          setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
        }
        void load();
      })
      .subscribe();
    const poll = setInterval(() => void load(), 60000);
    return () => {
      clearInterval(poll);
      void supabase.removeChannel(ch);
    };
  }, [auth.ready, load]);

  const approve = async (r: Row) => {
    if (!r.set) return;
    setBusy('approve');
    try {
      await setStatus([r.set.id], 'approved', null);
      setMsg(`Đã duyệt ${r.jo_no} · ${r.color_code}`);
      setSel(null);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const reject = async (r: Row) => {
    if (!r.set || !reason.trim()) return;
    setBusy('reject');
    try {
      await setStatus([r.set.id], 'rejected', reason.trim());
      setMsg(`Đã trả lại ${r.jo_no} · ${r.color_code}`);
      setSel(null);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const checkedRows = (rows || []).filter((r) => checked.has(r.key));
  const approvable = checkedRows.filter((r) => r.set && r.ie === 2 && (r.status === 'submitted' || r.status === 'draft' || r.status === 'rejected'));
  const exportable = checkedRows.filter((r) => r.set && r.status === 'approved' && r.ie === 2);

  const approveChecked = async () => {
    if (!approvable.length || !window.confirm(`Duyệt ${approvable.length} bộ ảnh đã chọn?`)) return;
    setBusy('bulk');
    try {
      await setStatus(approvable.map((r) => r.set!.id), 'approved', null);
      setMsg(`Đã duyệt ${approvable.length} bộ ảnh`);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const doExport = async (mode: 'xlsx' | 'pdf') => {
    if (!exportable.length) return;
    const skipped = checkedRows.length - exportable.length;
    if (skipped && !window.confirm(`${skipped} dòng chưa duyệt sẽ bị bỏ qua. Tiếp tục xuất?`)) return;
    setBusy('export-' + mode);
    setErr('');
    try {
      const byStyle = new Map<string, IEItem[]>();
      exportable.forEach((r) => {
        if (!byStyle.has(r.cust_style)) byStyle.set(r.cust_style, []);
        byStyle.get(r.cust_style)!.push({ jo: r.jo_no, lot: r.lot, color: r.color_code, setId: r.set!.id });
      });
      const names: string[] = [];
      for (const [style, items] of byStyle) names.push(await exportIE(style, items, mode, setMsg));
      setMsg(`Đã xuất: ${names.join(', ')}`);
    } catch (e) {
      setErr((e as Error).message);
      setMsg('');
    } finally {
      setBusy('');
    }
  };

  const toggle = (k: string) =>
    setChecked((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const allShownChecked = shown.length > 0 && shown.every((r) => checked.has(r.key));
  const toggleAll = () =>
    setChecked((prev) => {
      const n = new Set(prev);
      shown.forEach((r) => (allShownChecked ? n.delete(r.key) : n.add(r.key)));
      return n;
    });

  if (!auth.ready) return <Spinner />;
  const pct = Math.round((storage / STORAGE_LIMIT_BYTES) * 100);

  const kindOrder: PhotoKind[] = ['label', 'fold', 'hangtag', 'front', 'carton', 'carton_face', 'carton_label', 'defect'];

  return (
    <main className="min-h-screen">
      <AdminNav active="review" />
      <div className="mx-auto flex max-w-[1360px] flex-col gap-4 px-4 py-5 md:px-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {(
            [
              { f: 'alert', l: `Cảnh báo BPOD (≤${BPO_ALERT_DAYS} ngày)`, v: alerts.length, c: alerts.length ? 'text-bad' : 'text-ok' },
              { f: 'submitted', l: 'Chờ duyệt', v: kpi.submitted, c: 'text-brand-dark' },
              { f: 'draft', l: 'Đang chụp (nháp)', v: kpi.draft, c: 'text-warn' },
              { f: 'approved', l: 'Đã duyệt', v: kpi.approved, c: 'text-ok' },
            ] as const
          ).map((k) => {
            const on = fStatus === k.f;
            return (
              <button
                key={k.f}
                onClick={() => {
                  setFStatus(on ? 'live' : k.f);
                  document.getElementById('bang-chinh')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={`rounded-xl border bg-white px-4 py-3 text-left transition hover:border-brand ${on ? 'border-brand ring-2 ring-brand/30' : 'border-line'}`}
                title={on ? 'Bấm lần nữa để bỏ lọc' : 'Bấm để lọc bảng bên dưới'}
              >
                <div className="text-xs text-muted">
                  {k.l}
                  {on ? ' · đang lọc' : ''}
                </div>
                <div className={`text-2xl font-bold ${k.c}`}>{k.v}</div>
              </button>
            );
          })}
          <Link href="/admin/cleanup" className="rounded-xl border border-line bg-white px-4 py-3">
            <div className="text-xs text-muted">Dung lượng ảnh (free 1 GB)</div>
            <div className={`text-2xl font-bold ${pct >= 90 ? 'text-bad' : pct >= 80 ? 'text-warn' : 'text-ink'}`}>
              {fmtMB(storage)} · {pct}%
            </div>
          </Link>
        </div>

        {alerts.length > 0 && (
          <section className="flex flex-col gap-2 rounded-xl border border-bad/40 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-bold text-bad">⚠ Cảnh báo BPO date – {alerts.length} JO × màu chưa duyệt ảnh</h2>
              <span className="text-xs text-muted">
                Cảnh báo từ {BPO_ALERT_DAYS} ngày trước BPOD · hạn gửi báo cáo buyer = BPOD − {BPO_SEND_DAYS} ngày
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <tbody>
                  {(showAllAlerts ? alerts : alerts.slice(0, 8)).map((r) => (
                    <tr key={r.key} className="border-t border-[#EEF0F3] first:border-t-0">
                      <td className="py-1.5 pr-2">
                        <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${ALERT_CLS[r.alert!.level]}`}>{r.alert!.label}</span>
                      </td>
                      <td className="px-2 py-1.5 font-semibold">{r.cust_style}</td>
                      <td className="px-2 py-1.5">
                        {r.lot} · {r.color_code}
                      </td>
                      <td className="px-2 py-1.5 text-muted">{r.jo_no}</td>
                      <td className="px-2 py-1.5">BPOD {fmtDate(r.bpo_date)}</td>
                      <td className="px-2 py-1.5">
                        <StatusChip status={r.status} />
                      </td>
                      <td className="px-2 py-1.5">IE {r.ie}/2</td>
                      <td className="py-1 pl-2 text-right">
                        <button onClick={() => openRow(r)} className={btn.small}>
                          Xem ảnh
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {alerts.length > 8 && (
              <button onClick={() => setShowAllAlerts((v) => !v)} className="self-start text-sm text-brand underline">
                {showAllAlerts ? 'Thu gọn' : `Xem tất cả ${alerts.length} dòng`}
              </button>
            )}
          </section>
        )}

        {err && <ErrorBox text={err} />}
        {msg && <div className="rounded-xl border border-ok/30 bg-ok-soft p-3 text-sm text-ok">{msg}</div>}

        <div className="flex flex-wrap items-start gap-4">
          <section id="bang-chinh" className="min-w-0 flex-[999_1_560px] scroll-mt-4 rounded-xl border border-line bg-white">
            <div className="flex flex-wrap items-end gap-2 border-b border-line p-3">
              <label className="flex flex-col gap-0.5 text-[11px] text-muted">
                Tìm
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Style, JO, GO, màu" className="h-9 w-48 rounded-lg border border-[#CBD2DA] px-2 text-[13px] text-ink" />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] text-muted">
                Trạng thái
                <select value={fStatus} onChange={(e) => setFStatus(e.target.value as 'live' | 'alert' | SetStatus)} className="h-9 rounded-lg border border-[#CBD2DA] px-2 text-[13px] text-ink">
                  <option value="live">Tất cả (trừ đã lưu trữ)</option>
                  <option value="alert">⚠ Sắp đến BPOD (≤{BPO_ALERT_DAYS} ngày)</option>
                  {(Object.keys(STATUS_INFO) as SetStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_INFO[s].label}
                    </option>
                  ))}
                </select>
              </label>
              <span className="flex-1" />
              <button
                disabled={!reviewQueue.length || !!busy}
                onClick={() => {
                  setSel(null);
                  setReviewing(true);
                }}
                className="h-9 rounded-lg bg-ink px-3 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                ▶ Duyệt lần lượt ({reviewQueue.length})
              </button>
              <span className="self-center text-xs text-muted">Đã chọn {checkedRows.length}</span>
              <button disabled={!approvable.length || !!busy} onClick={approveChecked} className={btn.small}>
                Duyệt {approvable.length || ''} dòng chọn
              </button>
              <div className="flex items-center gap-1.5 rounded-xl border border-[#C4D6F3] bg-[#F2F6FD] px-1.5 py-1">
                <span className="px-1 text-xs font-bold text-brand-dark">Báo cáo IE ({exportable.length})</span>
                <button disabled={!exportable.length || !!busy} onClick={() => doExport('xlsx')} className="h-9 rounded-lg bg-[#1D6F42] px-3 text-[13px] font-semibold text-white disabled:opacity-40">
                  {busy === 'export-xlsx' ? 'Đang xuất…' : 'Xuất Excel'}
                </button>
                <button disabled={!exportable.length || !!busy} onClick={() => doExport('pdf')} className="h-9 rounded-lg bg-[#B42318] px-3 text-[13px] font-semibold text-white disabled:opacity-40">
                  {busy === 'export-pdf' ? 'Đang xuất…' : 'Xuất PDF'}
                </button>
              </div>
              <Link href="/admin/final" className="flex h-9 items-center rounded-lg border border-[#CBD2DA] bg-white px-3 text-[13px] font-semibold text-ink">
                Final report → Chèn ảnh GQS
              </Link>
            </div>
            <div className="overflow-x-auto">
              {!rows ? (
                <Spinner />
              ) : (
                <table className="w-full min-w-[840px] border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-[#F7F8FA] text-left text-muted">
                      <th className="w-10 px-3 py-2">
                        <input type="checkbox" checked={allShownChecked} onChange={toggleAll} aria-label="Chọn tất cả" />
                      </th>
                      <th className="px-2 py-2 font-semibold">Style</th>
                      <th className="px-2 py-2 font-semibold">Lot (đuôi JO)</th>
                      <th className="px-2 py-2 font-semibold">JO</th>
                      <th className="px-2 py-2 font-semibold">GO</th>
                      <th className="px-2 py-2 font-semibold">Màu</th>
                      <th className="px-2 py-2 font-semibold">Ảnh IE</th>
                      <th className="px-2 py-2 font-semibold">Ngày may</th>
                      <th className="px-2 py-2 font-semibold">BPOD</th>
                      <th className="px-2 py-2 font-semibold">Trạng thái</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.key} className={`border-t border-[#EEF0F3] ${sel?.key === r.key ? 'bg-[#F2F6FD]' : ''}`}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={checked.has(r.key)} onChange={() => toggle(r.key)} aria-label={`Chọn ${r.jo_no} ${r.color_code}`} />
                        </td>
                        <td className="px-2 py-2 font-semibold">{r.cust_style}</td>
                        <td className="px-2 py-2">{r.lot}</td>
                        <td className="px-2 py-2">{r.jo_no}</td>
                        <td className="px-2 py-2">{r.go_no}</td>
                        <td className="px-2 py-2">{r.color_code}</td>
                        <td className={`px-2 py-2 ${r.ie === 2 ? 'text-ok' : 'text-warn'}`}>{r.ie}/2</td>
                        <td className="px-2 py-2">{fmtDate(r.sew_start)}</td>
                        <td className="px-2 py-2">
                          <span className={r.alert ? `rounded-md px-1.5 py-0.5 text-xs font-semibold ${ALERT_CLS[r.alert.level]}` : ''} title={r.alert?.label}>
                            {fmtDate(r.bpo_date)}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <StatusChip status={r.status} />
                          {!r.in_recap && <span className="ml-1 text-[11px] text-bad">không còn trong recap</span>}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <button onClick={() => openRow(r)} className={btn.small}>
                            Xem ảnh
                          </button>
                        </td>
                      </tr>
                    ))}
                    {shown.length === 0 && (
                      <tr>
                        <td colSpan={11} className="p-6 text-center text-muted">
                          {rows.length === 0 ? 'Chưa có dữ liệu – vào "Nhập recap" để tải file.' : 'Không có dòng nào khớp bộ lọc.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {sel && (
            <aside className="flex flex-[1_1_360px] flex-col gap-3 rounded-xl border border-line bg-white p-4 lg:sticky lg:top-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[15px] font-bold">
                    {sel.cust_style} · {sel.lot} · {sel.color_code}
                  </div>
                  <div className="text-xs text-muted">
                    {sel.jo_no} · {sel.category}
                    {sel.set?.submitted_at ? ` · gửi ${new Date(sel.set.submitted_at).toLocaleString('vi-VN')}` : ''}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setReviewing(false);
                    setSel(null);
                  }}
                  className="text-sm text-muted"
                >
                  {reviewing ? 'Dừng duyệt' : 'Đóng'}
                </button>
              </div>
              {kindOrder.map((k) => {
                const ps = selPhotos.filter((p) => p.kind === k);
                if (!ps.length && k !== 'label' && k !== 'fold') return null;
                return (
                  <div key={k} className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold">
                      {KIND_INFO[k].name}
                      {k === 'defect' ? ` (${ps.length})` : ''}
                    </span>
                    {ps.length ? (
                      <div className="grid grid-cols-3 gap-1.5">
                        {ps.map((p) => {
                          const cap = k === 'defect' ? `${p.defect_name} (${p.severity}) – ${p.position}${p.note ? ` · ${p.note}` : ''}` : KIND_INFO[k].name;
                          return (
                            <button key={p.id} onClick={() => setView({ src: urls[p.path], cap })} className="flex flex-col gap-0.5 text-left">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={urls[p.path]} alt={cap} className="h-20 w-full rounded-md bg-[#EEF0F3] object-cover" />
                              {k === 'defect' && <span className="text-[10px] leading-tight text-muted">{cap}</span>}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex h-12 items-center justify-center rounded-md bg-warn-soft text-xs text-warn">Thiếu ảnh</div>
                    )}
                  </div>
                );
              })}
              {sel.set && sel.status !== 'archived' && (
                <>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Lý do trả lại
                    <textarea
                      rows={2}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="vd. Ảnh mác bị mờ, chụp lại"
                      className="rounded-lg border border-[#CBD2DA] p-2 text-[13px] text-ink"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button disabled={!reason.trim() || !!busy} onClick={() => reject(sel)} className="h-11 flex-1 rounded-xl border border-[#F1C4C4] text-sm font-semibold text-bad disabled:opacity-40">
                      Trả lại QA
                    </button>
                    <button disabled={sel.ie < 2 || !!busy || sel.status === 'approved'} onClick={() => approve(sel)} className="h-11 flex-1 rounded-xl bg-ok text-sm font-semibold text-white disabled:opacity-40">
                      {sel.status === 'approved' ? 'Đã duyệt' : 'Duyệt'}
                    </button>
                  </div>
                </>
              )}
              <Link href={`/qa/${encodeURIComponent(sel.jo_no)}`} className="text-center text-[13px] text-brand underline">
                Mở màn hình chụp của JO này
              </Link>
            </aside>
          )}
        </div>
      </div>
      <div className="fixed right-4 top-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-lg">
            🔔 {t.text}
          </div>
        ))}
      </div>
      <Lightbox src={view?.src || null} caption={view?.cap} onClose={() => setView(null)} />
    </main>
  );
}
