'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRequire } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { deletePhotos, getOrCreateSet, reusePhoto, signedUrls } from '@/lib/photos';
import type { Compressed } from '@/lib/image';
import { KIND_INFO, isShared } from '@/lib/config';
import { enqueue, jobBlob, removeJob, useQueue, type UploadJob } from '@/lib/queue';
import type { JoColor, Photo, PhotoKind, PhotoSet } from '@/lib/types';
import { ErrorBox, Spinner, StatusChip, TopBar, btn, fmtDate } from '@/components/ui';
import { PhotoSlot } from '@/components/PhotoSlot';
import { Lightbox } from '@/components/Lightbox';
import { CropModal } from '@/components/CropModal';
import { ConfirmDialog, QueueBadge, UndoBar, useUndoDelete } from '@/components/Feedback';

interface OtherLabel {
  lot: string;
  jo: string;
  photo: Photo;
}

export default function CapturePage() {
  const auth = useRequire();
  const router = useRouter();
  const params = useParams<{ jo: string }>();
  const jo = decodeURIComponent(params.jo);
  const [rows, setRows] = useState<JoColor[]>([]);
  const [sets, setSets] = useState<PhotoSet[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]); // ảnh riêng lot (theo set)
  const [shared, setShared] = useState<Photo[]>([]); // ảnh dùng chung style × màu
  const [others, setOthers] = useState<Record<string, OtherLabel[]>>({}); // ảnh mác các lot khác, theo màu
  const [legacy, setLegacy] = useState<Photo[]>([]); // ảnh gập gói/thẻ bài/thùng cũ còn lưu theo lot (trước v1.5)
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [color, setColor] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<{ src: string; cap: string } | null>(null);
  const [crop, setCrop] = useState<{ kind: PhotoKind; file: File } | null>(null);
  const [askSubmit, setAskSubmit] = useState(false);
  const [reuseOpen, setReuseOpen] = useState(false);
  const [sent, setSent] = useState('');

  const load = useCallback(async () => {
    const { data: r, error } = await supabase.from('jo_colors').select('*').eq('jo_no', jo).order('color_code');
    if (error) return setErr(error.message);
    const jr = (r || []) as JoColor[];
    setRows(jr);
    if (!jr.length) return setLoaded(true);
    const style = jr[0].cust_style;
    const colors = jr.map((x) => x.color_code);
    const { data: s } = await supabase.from('photo_sets').select('*').eq('jo_no', jo);
    const ss = (s || []) as PhotoSet[];
    setSets(ss);
    const own: Photo[] = [];
    if (ss.length) {
      const { data: p } = await supabase.from('photos').select('*').in('set_id', ss.map((x) => x.id)).order('created_at');
      own.push(...((p || []) as Photo[]));
    }
    setPhotos(own);
    const { data: sh } = await supabase.from('photos').select('*').is('set_id', null).eq('cust_style', style).in('color_code', colors).order('created_at');
    const shp = (sh || []) as Photo[];
    setShared(shp);
    // Ảnh mác của các lot khác cùng style × màu (để dùng lại)
    const { data: oj } = await supabase.from('jo_colors').select('jo_no,lot,color_code').eq('cust_style', style).in('color_code', colors).neq('jo_no', jo);
    const otherRows = (oj || []) as Pick<JoColor, 'jo_no' | 'lot' | 'color_code'>[];
    const map: Record<string, OtherLabel[]> = {};
    const extra: string[] = [];
    if (otherRows.length) {
      const { data: os } = await supabase.from('photo_sets').select('*').in('jo_no', Array.from(new Set(otherRows.map((x) => x.jo_no))));
      const osets = ((os || []) as PhotoSet[]).filter((x) => colors.includes(x.color_code));
      if (osets.length) {
        const { data: op } = await supabase
          .from('photos')
          .select('*')
          .in('set_id', osets.map((x) => x.id))
          .in('kind', ['label', 'fold', 'hangtag', 'carton', 'carton_face'])
          .order('created_at');
        const all = (op || []) as Photo[];
        setLegacy(all.filter((p) => p.kind !== 'label'));
        extra.push(...all.filter((p) => p.kind !== 'label').map((p) => p.path));
        all.filter((p) => p.kind === 'label').forEach((p) => {
          const st = osets.find((x) => x.id === p.set_id)!;
          const rr = otherRows.find((x) => x.jo_no === st.jo_no && x.color_code === st.color_code);
          (map[st.color_code] ||= []).push({ lot: rr?.lot || st.jo_no, jo: st.jo_no, photo: p });
          extra.push(p.path);
        });
      }
    }
    setOthers(map);
    setUrls(await signedUrls([...own, ...shp].map((p) => p.path).concat(extra)));
    setColor((c) => c || jr[0].color_code);
    setLoaded(true);
  }, [jo]);

  const onDone = useCallback(
    (j: UploadJob) => {
      if (j.jo === jo || isShared(j.kind)) void load();
    },
    [jo, load],
  );
  const { jobs, retry } = useQueue(onDone);
  const undo = useUndoDelete<Photo>(
    async (items) => {
      await deletePhotos(items);
      await load();
    },
    (m) => {
      setErr(m);
      void load();
    },
  );

  useEffect(() => {
    if (auth.ready) load();
  }, [auth.ready, load]);

  const info = rows[0];
  const myJobs = useMemo(
    () => (info ? jobs.filter((j) => j.color === color && (isShared(j.kind) ? j.style === info.cust_style : j.jo === jo)) : []),
    [jobs, color, jo, info],
  );
  const jobUrls = useMemo(() => {
    const m: Record<string, string> = {};
    myJobs.forEach((j) => {
      const b = jobBlob(j);
      if (b) m[j.id] = URL.createObjectURL(b);
    });
    return m;
  }, [myJobs]);
  useEffect(() => () => Object.values(jobUrls).forEach((u) => URL.revokeObjectURL(u)), [jobUrls]);

  if (!auth.ready || !loaded)
    return err ? (
      <div className="p-4">
        <ErrorBox text={err} />
      </div>
    ) : (
      <Spinner />
    );
  if (!info)
    return (
      <div className="p-4">
        <TopBar title={jo} back="/qa" />
        <p className="p-6 text-center text-sm text-muted">Không tìm thấy JO này trong recap.</p>
      </div>
    );

  const set = sets.find((s) => s.color_code === color);
  const status = set?.status || 'draft';
  const editable = auth.role === 'admin' || !set || status === 'draft' || status === 'rejected';

  const latest = (kind: PhotoKind, c = color) => {
    const setId = sets.find((s) => s.color_code === c)?.id;
    if (isShared(kind)) {
      const sh = shared.filter((p) => p.kind === kind && p.color_code === c && !undo.isHidden(p.id)).slice(-1)[0];
      if (sh) return sh;
      // Dữ liệu cũ (trước v1.5) còn lưu theo lot: lấy ảnh của lot này hoặc lot khác cùng màu
      const kinds = kind === 'carton' ? ['carton', 'carton_face'] : [kind];
      const old = [...photos.filter((p) => p.set_id === setId), ...legacy].filter((p) => kinds.includes(p.kind) && p.color_code === c);
      return old.slice(-1)[0];
    }
    return photos.filter((p) => p.set_id === setId && p.kind === kind && !undo.isHidden(p.id)).slice(-1)[0];
  };
  const pendingOf = (kind: PhotoKind) => myJobs.filter((j) => j.kind === kind).slice(-1)[0];
  const ieCount = (c: string) => {
    const label = jobs.some((j) => j.color === c && j.kind === 'label' && j.jo === jo) || !!latest('label', c);
    const fold = jobs.some((j) => j.color === c && j.kind === 'fold' && j.style === info.cust_style) || !!latest('fold', c);
    return Number(label) + Number(fold);
  };

  const save = async (kind: PhotoKind, img: Compressed) => {
    setCrop(null);
    setErr('');
    try {
      await enqueue({ kind, style: info.cust_style, color, jo, blob: img.blob, width: img.width, height: img.height });
    } catch (e) {
      setErr('Không lưu được ảnh vào máy: ' + (e as Error).message);
    }
  };

  const doReuse = async (o: OtherLabel) => {
    setReuseOpen(false);
    setBusy('label');
    try {
      const s = await getOrCreateSet(jo, color);
      await reusePhoto(o.photo, s.id);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const ieReady = ieCount(color) === 2;
  const waiting = myJobs.length > 0;
  const submit = async () => {
    setAskSubmit(false);
    setBusy('submit');
    try {
      const s = set || (await getOrCreateSet(jo, color));
      const { error } = await supabase
        .from('photo_sets')
        .update({ status: 'submitted', submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', s.id);
      if (error) throw new Error(error.message);
      setSent(color);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const slot = (kind: PhotoKind, opts: { title?: string; badge?: string; required?: boolean } = {}) => {
    const p = latest(kind);
    const job = pendingOf(kind);
    const url = job ? jobUrls[job.id] : p ? urls[p.path] : undefined;
    const badge = job ? (job.status === 'error' ? '⚠ Lỗi tải lên – sẽ tự thử lại' : '⏳ Đã lưu máy – chờ tải lên') : opts.badge;
    return (
      <PhotoSlot
        key={kind}
        title={opts.title || KIND_INFO[kind].name}
        hint={KIND_INFO[kind].hint}
        badge={badge}
        required={opts.required}
        url={url}
        editable={editable}
        busy={busy === kind}
        onPick={(f) => setCrop({ kind, file: f })}
        onDelete={() => (job ? void removeJob(job.id) : p && undo.remove(p))}
        onView={() => url && setView({ src: url, cap: `${KIND_INFO[kind].name} · ${color}` })}
      />
    );
  };

  const defects = photos.filter((p) => p.set_id === set?.id && p.kind === 'defect' && !undo.isHidden(p.id));
  const pendDefects = myJobs.filter((j) => j.kind === 'defect');
  const curLabel = latest('label');
  const reuseList = (others[color] || []).filter((o) => o.photo.path !== curLabel?.path);

  return (
    <main className="mx-auto flex min-h-screen max-w-[640px] flex-col">
      <div className="sticky top-0 z-30 bg-white">
      <TopBar
        title={`${info.cust_style} · ${info.lot}`}
        sub={`${jo} · ${info.category} · BPOD ${fmtDate(info.bpo_date)}`}
        back="/qa"
        right={
          <div className="flex flex-col items-end gap-1">
            <StatusChip status={status} />
            <QueueBadge jobs={jobs} onRetry={retry} />
          </div>
        }
      />
      <div className="flex gap-1 overflow-x-auto border-b border-line bg-white px-3">
        {rows.map((r) => (
          <button
            key={r.color_code}
            onClick={() => setColor(r.color_code)}
            className={`h-11 shrink-0 border-b-[3px] px-3 text-sm ${r.color_code === color ? 'border-brand font-bold text-brand' : 'border-transparent text-muted'}`}
          >
            {r.color_code} · IE {ieCount(r.color_code)}/2
          </button>
        ))}
      </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4 pb-40">
        {err && <ErrorBox text={err} />}
        {status === 'rejected' && set?.reject_reason && (
          <div className="rounded-xl border border-bad/30 bg-bad-soft p-3 text-sm text-bad">
            <b>Admin trả lại:</b> {set.reject_reason}
          </div>
        )}
        {!editable && (
          <div className="rounded-xl border border-line bg-white p-3 text-sm text-muted">
            Bộ ảnh màu {color} đang {status === 'submitted' ? 'chờ admin duyệt' : 'đã duyệt'} nên không sửa được.
          </div>
        )}

        <section className="flex flex-col gap-2.5 rounded-2xl border border-line bg-white p-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-bold">
              Riêng lot {info.lot} · màu {color}
            </h2>
            <span className="text-[11px] text-muted">mỗi lot khác nhau</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">{slot('label', { title: 'Mác sườn', badge: 'IE ①② + Final', required: true })}</div>
          {editable && reuseList.length > 0 && (
            <button onClick={() => setReuseOpen(true)} className="h-11 rounded-xl border border-dashed border-brand bg-[#F2F6FD] text-[13px] font-semibold text-brand-dark">
              ↺ Dùng lại ảnh mác của lot khác ({reuseList.length})
            </button>
          )}
          <div className="flex flex-col gap-2 rounded-xl border border-[#F1C4C4] p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold">Defect Photo – Ảnh lỗi</div>
                <div className="text-[11px] text-muted">
                  {defects.length} ảnh{pendDefects.length ? ` · ${pendDefects.length} chờ tải lên` : ''}
                </div>
              </div>
              <span className="rounded-md bg-bad-soft px-1.5 py-0.5 text-[10px] font-medium text-bad">Final report</span>
            </div>
            {(defects.length > 0 || pendDefects.length > 0) && (
              <div className="grid grid-cols-3 gap-1.5">
                {pendDefects.map((j) => (
                  <div key={j.id} className="flex flex-col gap-0.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={jobUrls[j.id]} alt="Ảnh lỗi chờ tải" className="h-16 w-full rounded-md bg-[#EEF0F3] object-cover opacity-70" />
                    <span className={`text-[10px] ${j.status === 'error' ? 'text-bad' : 'text-warn'}`}>{j.status === 'error' ? '⚠ lỗi tải' : '⏳ chờ tải lên'}</span>
                  </div>
                ))}
                {defects.slice(-6).map((p) => {
                  const cap = `${p.defect_name} (${p.severity}) – ${p.position}`;
                  return (
                    <button key={p.id} onClick={() => setView({ src: urls[p.path], cap })} className="flex flex-col gap-0.5 text-left">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={urls[p.path]} alt={cap} className="h-16 w-full rounded-md bg-[#EEF0F3] object-cover" />
                      <span className="text-[10px] leading-tight text-muted">{cap}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <Link
              href={`/qa/${encodeURIComponent(jo)}/defect?color=${encodeURIComponent(color)}`}
              className={`flex h-11 items-center justify-center rounded-lg text-sm font-semibold ${editable ? 'bg-bad text-white' : 'border border-line text-ink'}`}
            >
              {editable ? '+ Chụp / xem / xóa ảnh lỗi' : `Xem ${defects.length} ảnh lỗi`}
            </Link>
          </div>
        </section>

        <section className="flex flex-col gap-2.5 rounded-2xl border border-[#C4D6F3] bg-white p-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-bold">Dùng chung mọi lot · màu {color}</h2>
            <span className="text-[11px] text-brand-dark">chụp 1 lần cho mọi lot</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {slot('fold', { badge: info.category === 'Men' ? 'IE ③ + Final' : 'IE ③', required: true })}
            {slot('hangtag', { badge: 'Final – Accessory' })}
            {slot('front', { badge: 'Final – Style photo' })}
            {info.category === 'Men' && slot('carton', { badge: 'Final – Men' })}
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3">
        <div className="mx-auto flex max-w-[608px] flex-col gap-2">
          <p className={`text-center text-xs ${ieReady && !waiting ? 'text-ok' : 'text-warn'}`}>
            {waiting
              ? `Đang chờ tải ${myJobs.length} ảnh lên – ảnh đã được lưu trong máy`
              : ieReady
                ? `Màu ${color} đã đủ ảnh IE`
                : `Còn thiếu ảnh IE ở màu ${color} – ảnh đã chụp được tự lưu nháp`}
          </p>
          <div className="flex gap-2.5">
            <button
              onClick={() => {
                retry();
                router.push('/qa');
              }}
              className={`${btn.ghost} flex-1`}
            >
              {editable ? 'Lưu nháp' : '← Về danh sách'}
            </button>
            <button disabled={!editable || !ieReady || waiting || busy === 'submit'} onClick={() => setAskSubmit(true)} className={`${btn.primary} flex-[1.4]`}>
              {busy === 'submit' ? 'Đang gửi…' : `Gửi duyệt màu ${color}`}
            </button>
          </div>
        </div>
      </div>

      {reuseOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" role="dialog" aria-modal="true">
          <div className="flex max-h-[80vh] w-full max-w-[640px] flex-col gap-3 overflow-auto rounded-t-2xl bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
            <h2 className="text-base font-bold">Dùng lại ảnh mác sườn – màu {color}</h2>
            <p className="text-xs text-muted">Chỉ chọn khi mác lot {info.lot} giống hệt lot đã chụp. Ảnh không bị nhân đôi dung lượng.</p>
            {reuseList.map((o) => (
              <button key={o.photo.id} onClick={() => doReuse(o)} className="flex items-center gap-3 rounded-xl border border-line p-2 text-left">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={urls[o.photo.path]} alt={`Mác ${o.lot}`} className="h-16 w-24 rounded-lg bg-[#EEF0F3] object-cover" />
                <span className="flex flex-col">
                  <b className="text-sm">{o.lot}</b>
                  <span className="text-[11px] text-muted">
                    {o.jo} · chụp {fmtDate(o.photo.created_at)}
                  </span>
                </span>
              </button>
            ))}
            <button onClick={() => setReuseOpen(false)} className="h-11 rounded-xl border border-[#CBD2DA] text-sm">
              Hủy – mác khác, chụp mới
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={askSubmit}
        title={`Gửi duyệt màu ${color}?`}
        body={`${info.cust_style} · ${info.lot} · ${jo}. Sau khi gửi, QA không sửa được ảnh cho đến khi admin trả lại.`}
        okText="Gửi duyệt"
        onOk={submit}
        onCancel={() => setAskSubmit(false)}
      />
      {sent && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-3 sm:items-center" role="dialog" aria-modal="true">
          <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-white p-5 text-ink">
            <h2 className="text-base font-bold">✓ Đã gửi duyệt màu {sent}</h2>
            <p className="text-sm text-muted">
              {info.cust_style} · {info.lot}. Admin sẽ duyệt trên trang Admin.
            </p>
            {(() => {
              const next = rows.find((r) => r.color_code !== sent && (sets.find((x) => x.color_code === r.color_code)?.status || 'draft') !== 'approved' && (sets.find((x) => x.color_code === r.color_code)?.status || 'draft') !== 'submitted');
              return next ? (
                <button
                  onClick={() => {
                    setSent('');
                    setColor(next.color_code);
                    window.scrollTo({ top: 0 });
                  }}
                  className="h-12 rounded-xl border border-[#CBD2DA] text-sm font-semibold"
                >
                  Chụp tiếp màu {next.color_code}
                </button>
              ) : null;
            })()}
            <button onClick={() => router.push('/qa')} className="h-12 rounded-xl bg-brand text-sm font-semibold text-white">
              Về danh sách JO (làm lot khác)
            </button>
          </div>
        </div>
      )}
      <UndoBar count={undo.pending.length} onUndo={undo.undo} />
      <Lightbox src={view?.src || null} caption={view?.cap} onClose={() => setView(null)} />
      {crop && <CropModal file={crop.file} kind={crop.kind} onCancel={() => setCrop(null)} onDone={(img) => save(crop.kind, img)} />}
    </main>
  );
}
