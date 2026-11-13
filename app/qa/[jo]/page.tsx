'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useRequire } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { deletePhotos, getOrCreateSet, signedUrls, uploadPhoto } from '@/lib/photos';
import type { Compressed } from '@/lib/image';
import { KIND_INFO } from '@/lib/config';
import type { JoColor, Photo, PhotoKind, PhotoSet } from '@/lib/types';
import { ErrorBox, Spinner, StatusChip, TopBar, btn, fmtDate } from '@/components/ui';
import { PhotoSlot } from '@/components/PhotoSlot';
import { Lightbox } from '@/components/Lightbox';
import { CropModal } from '@/components/CropModal';

export default function CapturePage() {
  const auth = useRequire();
  const params = useParams<{ jo: string }>();
  const jo = decodeURIComponent(params.jo);
  const [rows, setRows] = useState<JoColor[]>([]);
  const [sets, setSets] = useState<PhotoSet[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [color, setColor] = useState('');
  const [busy, setBusy] = useState<string>('');
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<{ src: string; cap: string } | null>(null);
  const [crop, setCrop] = useState<{ kind: PhotoKind; file: File } | null>(null);

  const load = useCallback(async () => {
    const { data: r, error } = await supabase.from('jo_colors').select('*').eq('jo_no', jo).order('color_code');
    if (error) return setErr(error.message);
    const jr = (r || []) as JoColor[];
    setRows(jr);
    const { data: s } = await supabase.from('photo_sets').select('*').eq('jo_no', jo);
    const ss = (s || []) as PhotoSet[];
    setSets(ss);
    const list: Photo[] = [];
    if (ss.length) {
      const { data: p } = await supabase.from('photos').select('*').in('set_id', ss.map((x) => x.id)).order('created_at');
      list.push(...((p || []) as Photo[]));
    }
    if (jr.length) {
      const { data: f } = await supabase
        .from('photos')
        .select('*')
        .is('set_id', null)
        .eq('kind', 'front')
        .eq('cust_style', jr[0].cust_style)
        .in('color_code', jr.map((x) => x.color_code));
      list.push(...((f || []) as Photo[]));
    }
    setPhotos(list);
    setUrls(await signedUrls(list.map((p) => p.path)));
    setColor((c) => c || jr[0]?.color_code || '');
    setLoaded(true);
  }, [jo]);

  useEffect(() => {
    if (auth.ready) load();
  }, [auth.ready, load]);

  if (!auth.ready || !loaded) return err ? <div className="p-4"><ErrorBox text={err} /></div> : <Spinner />;
  if (!rows.length)
    return (
      <div className="p-4">
        <TopBar title={jo} back="/qa" />
        <p className="p-6 text-center text-sm text-muted">Không tìm thấy JO này trong recap.</p>
      </div>
    );

  const info = rows[0];
  const set = sets.find((s) => s.color_code === color);
  const status = set?.status || 'draft';
  const editable = auth.role === 'admin' || !set || status === 'draft' || status === 'rejected';
  const ofKind = (kind: PhotoKind) =>
    kind === 'front'
      ? photos.filter((p) => p.kind === 'front' && p.set_id === null && p.color_code === color)
      : photos.filter((p) => p.set_id === set?.id && p.kind === kind);
  const one = (kind: PhotoKind) => ofKind(kind).slice(-1)[0];
  const ieCountFor = (c: string) => {
    const s = sets.find((x) => x.color_code === c);
    if (!s) return 0;
    return ['label', 'fold'].filter((k) => photos.some((p) => p.set_id === s.id && p.kind === k)).length;
  };

  const pick = (kind: PhotoKind, file: File) => setCrop({ kind, file });

  const save = async (kind: PhotoKind, img: Compressed) => {
    setCrop(null);
    setErr('');
    setBusy(kind);
    try {
      const s = await getOrCreateSet(jo, color);
      await uploadPhoto({ img, kind, style: info.cust_style, color, jo, setId: s.id });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const remove = async (p?: Photo) => {
    if (!p || !window.confirm(`Xóa ảnh ${KIND_INFO[p.kind].name}?`)) return;
    setBusy(p.kind);
    try {
      await deletePhotos([p]);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const ieReady = !!one('label') && !!one('fold');
  const submit = async () => {
    if (!set) return;
    setBusy('submit');
    const { error } = await supabase
      .from('photo_sets')
      .update({ status: 'submitted', submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', set.id);
    setBusy('');
    if (error) setErr(error.message);
    else load();
  };

  const slot = (kind: PhotoKind, opts: { title?: string; badge?: string; required?: boolean } = {}) => {
    const p = one(kind);
    return (
      <PhotoSlot
        key={kind}
        title={opts.title || KIND_INFO[kind].name}
        hint={KIND_INFO[kind].hint}
        badge={opts.badge}
        required={opts.required}
        url={p ? urls[p.path] : undefined}
        editable={editable}
        busy={busy === kind}
        onPick={(f) => pick(kind, f)}
        onDelete={() => remove(p)}
        onView={() => p && setView({ src: urls[p.path], cap: `${KIND_INFO[kind].name} · ${color}` })}
      />
    );
  };

  const defects = ofKind('defect');

  return (
    <main className="mx-auto flex min-h-screen max-w-[640px] flex-col">
      <TopBar
        title={`${info.cust_style} · ${info.lot}`}
        sub={`${jo} · GO ${info.go_no || '–'} · ${info.category} · May ${fmtDate(info.sew_start)}`}
        back="/qa"
        right={<StatusChip status={status} />}
      />
      <div className="sticky top-[60px] z-10 flex gap-1 overflow-x-auto border-b border-line bg-white px-3">
        {rows.map((r) => (
          <button
            key={r.color_code}
            onClick={() => setColor(r.color_code)}
            className={`h-11 shrink-0 border-b-[3px] px-3 text-sm ${
              r.color_code === color ? 'border-brand font-bold text-brand' : 'border-transparent text-muted'
            }`}
          >
            {r.color_code} · {ieCountFor(r.color_code)}/2
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-5 p-4 pb-40">
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

        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-bold">Ảnh cho báo cáo IE</h2>
            <span className="text-xs text-muted">{ieCountFor(color)}/2 ảnh</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {slot('label', { title: 'Mác sườn', badge: 'Cột ① ② IE + Final', required: true })}
            {slot('fold', { title: 'Gập gói', badge: info.category === 'Men' ? 'Cột ③ IE + Final' : 'Cột ③ IE', required: true })}
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <h2 className="text-sm font-bold">Ảnh cho Final report</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {slot('front', { badge: 'Dùng chung mọi lot' })}
            {slot('hangtag')}
            {info.category === 'Men' && slot('carton_face', { badge: 'Hàng Men' })}
            {info.category === 'Men' && slot('carton_label', { badge: 'Hàng Men' })}
          </div>
          <Link
            href={`/qa/${encodeURIComponent(jo)}/defect?color=${encodeURIComponent(color)}`}
            className="flex items-center justify-between rounded-xl border border-dashed border-[#E0A3A3] bg-white p-3.5 text-bad"
          >
            <span className="text-sm font-semibold">Ảnh lỗi ({defects.length})</span>
            <span className="text-sm">{editable ? 'Thêm / xem' : 'Xem'}</span>
          </Link>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3">
        <div className="mx-auto flex max-w-[608px] flex-col gap-2">
          <p className={`text-center text-xs ${ieReady ? 'text-ok' : 'text-warn'}`}>
            {ieReady ? `Màu ${color} đã đủ ảnh IE` : `Còn thiếu ảnh IE ở màu ${color} – ảnh đã chụp được lưu nháp tự động`}
          </p>
          <div className="flex gap-2.5">
            <Link href="/qa" className={`${btn.ghost} flex flex-1 items-center justify-center`}>
              Lưu nháp
            </Link>
            <button disabled={!editable || !ieReady || !set || busy === 'submit'} onClick={submit} className={`${btn.primary} flex-[1.4]`}>
              {busy === 'submit' ? 'Đang gửi…' : `Gửi duyệt màu ${color}`}
            </button>
          </div>
        </div>
      </div>
      <Lightbox src={view?.src || null} caption={view?.cap} onClose={() => setView(null)} />
      {crop && <CropModal file={crop.file} kind={crop.kind} onCancel={() => setCrop(null)} onDone={(img) => save(crop.kind, img)} />}
    </main>
  );
}
