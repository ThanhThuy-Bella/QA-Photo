'use client';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useRequire } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { deletePhotos, getOrCreateSet, signedUrls, uploadPhoto } from '@/lib/photos';
import type { Compressed } from '@/lib/image';
import { DEFECT_PHOTO_HINT } from '@/lib/config';
import type { DefectPosition, DefectType, JoColor, Photo, PhotoSet, Severity } from '@/lib/types';
import { ErrorBox, Spinner, TopBar, btn } from '@/components/ui';
import { Lightbox } from '@/components/Lightbox';
import { AlbumIcon, CameraIcon } from '@/components/PhotoSlot';
import { CropModal } from '@/components/CropModal';

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-10 rounded-full border px-3 text-[13px] font-medium ${on ? 'border-brand bg-brand text-white' : 'border-[#CBD2DA] bg-white text-ink'}`}
    >
      {children}
    </button>
  );
}

function DefectInner() {
  const auth = useRequire();
  const router = useRouter();
  const params = useParams<{ jo: string }>();
  const jo = decodeURIComponent(params.jo);
  const color = useSearchParams().get('color') || '';
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);

  const [row, setRow] = useState<JoColor | null>(null);
  const [set, setSet] = useState<PhotoSet | null>(null);
  const [list, setList] = useState<Photo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [types, setTypes] = useState<DefectType[]>([]);
  const [positions, setPositions] = useState<DefectPosition[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<{ src: string; cap: string } | null>(null);

  const [img, setImg] = useState<Compressed | null>(null);
  const [preview, setPreview] = useState('');
  const [dName, setDName] = useState('');
  const [sev, setSev] = useState<Severity | ''>('');
  const [pos, setPos] = useState('');
  const [otherPos, setOtherPos] = useState('');
  const [note, setNote] = useState('');
  const [cropFile, setCropFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    const { data: r } = await supabase.from('jo_colors').select('*').eq('jo_no', jo).eq('color_code', color).maybeSingle();
    setRow(r as JoColor | null);
    const { data: s } = await supabase.from('photo_sets').select('*').eq('jo_no', jo).eq('color_code', color).maybeSingle();
    setSet(s as PhotoSet | null);
    let ph: Photo[] = [];
    if (s) {
      const { data } = await supabase.from('photos').select('*').eq('set_id', (s as PhotoSet).id).eq('kind', 'defect').order('created_at');
      ph = (data || []) as Photo[];
    }
    setList(ph);
    setUrls(await signedUrls(ph.map((p) => p.path)));
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('defect_types').select('*').eq('active', true).order('sort'),
      supabase.from('defect_positions').select('*').eq('active', true).order('sort'),
    ]);
    setTypes((t || []) as DefectType[]);
    setPositions((p || []) as DefectPosition[]);
    setLoaded(true);
  }, [jo, color]);

  useEffect(() => {
    if (auth.ready) load();
  }, [auth.ready, load]);

  if (!auth.ready || !loaded) return <Spinner />;
  if (!row) return <div className="p-4"><ErrorBox text="Không tìm thấy JO / màu này." /></div>;

  const status = set?.status || 'draft';
  const editable = auth.role === 'admin' || !set || status === 'draft' || status === 'rejected';
  const type = types.find((t) => t.name === dName);
  const levels: Severity[] = type
    ? ([type.allow_critical && 'Critical', type.allow_major && 'Major', type.allow_minor && 'Minor'].filter(Boolean) as Severity[])
    : [];
  const curSev = levels.includes(sev as Severity) ? (sev as Severity) : levels.length === 1 ? levels[0] : '';
  const position = pos === '__other' ? otherPos.trim() : pos;
  const canSave = !!img && !!dName && !!curSev && !!position && !busy;

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) setCropFile(f);
  };

  const applyCropped = (c: Compressed) => {
    setCropFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setImg(c);
    setPreview(URL.createObjectURL(c.blob));
  };

  const save = async (next: boolean) => {
    if (!img || !curSev) return;
    setBusy(true);
    setErr('');
    try {
      const s = await getOrCreateSet(jo, color);
      await uploadPhoto({
        img,
        kind: 'defect',
        style: row.cust_style,
        color,
        jo,
        setId: s.id,
        defect: { name: dName, severity: curSev, position, note },
      });
      setImg(null);
      setPreview('');
      setNote('');
      if (next) {
        await load();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else router.push(`/qa/${encodeURIComponent(jo)}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: Photo) => {
    if (!window.confirm('Xóa ảnh lỗi này?')) return;
    try {
      await deletePhotos([p]);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const caption = (p: Photo) => `${p.defect_name} (${p.severity}) – ${p.position}${p.note ? ` · ${p.note}` : ''}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-[640px] flex-col">
      <TopBar title={`Ảnh lỗi · ${color}`} sub={`${row.cust_style} · ${jo} · ${list.length} ảnh (gợi ý tối đa ${DEFECT_PHOTO_HINT})`} back={`/qa/${encodeURIComponent(jo)}`} />
      <div className="flex flex-1 flex-col gap-4 p-4 pb-32">
        {err && <ErrorBox text={err} />}
        {list.length >= DEFECT_PHOTO_HINT && (
          <div className="rounded-xl border border-[#F3D9A4] bg-[#FFF7E8] p-3 text-xs text-[#6B4A0B]">
            Đã có {list.length} ảnh lỗi cho màu này. Chỉ chụp thêm khi là lỗi mới.
          </div>
        )}

        {list.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {list.map((p) => (
              <div key={p.id} className="flex flex-col overflow-hidden rounded-lg border border-line bg-white">
                <button onClick={() => setView({ src: urls[p.path], cap: caption(p) })} className="h-20 bg-[#EEF0F3]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urls[p.path]} alt={caption(p)} className="h-full w-full object-cover" />
                </button>
                <div className="p-1.5 text-[10px] leading-tight">{caption(p)}</div>
                {editable && (
                  <button onClick={() => remove(p)} className="h-8 border-t border-line text-[11px] text-bad">
                    Xóa
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {editable ? (
          <>
            <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
            <input ref={lib} type="file" accept="image/*" className="hidden" onChange={onFile} />
            {preview ? (
              <div className="relative overflow-hidden rounded-2xl bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Ảnh lỗi vừa chụp" className="max-h-[260px] w-full object-contain" />
                <div className="absolute bottom-2 right-2 flex gap-1.5">
                  <button onClick={() => cam.current?.click()} className="flex h-9 items-center gap-1 rounded-lg bg-white px-3 text-xs font-semibold">
                    <CameraIcon size={14} />
                    Chụp lại
                  </button>
                  <button onClick={() => lib.current?.click()} className="flex h-9 items-center gap-1 rounded-lg bg-white px-3 text-xs font-semibold">
                    <AlbumIcon size={14} />
                    Album
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-[#E0A3A3] bg-white p-4">
                <span className="text-center text-sm font-semibold text-bad">Thêm ảnh lỗi</span>
                <div className="flex gap-2">
                  <button onClick={() => cam.current?.click()} className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white">
                    <CameraIcon size={20} />
                    Chụp ảnh
                  </button>
                  <button onClick={() => lib.current?.click()} className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-[#CBD2DA] text-sm font-semibold text-ink">
                    <AlbumIcon size={20} />
                    Chọn từ album
                  </button>
                </div>
              </div>
            )}

            <section className="flex flex-col gap-2">
              <h2 className="text-[13px] font-bold">
                Tên lỗi – Defect <span className="text-bad">*</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {types.map((t) => (
                  <Chip key={t.id} on={dName === t.name} onClick={() => setDName(t.name)}>
                    {t.name}
                  </Chip>
                ))}
              </div>
            </section>

            {type && (
              <section className="flex flex-col gap-2">
                <h2 className="text-[13px] font-bold">
                  Mức độ – Severity <span className="text-bad">*</span>
                </h2>
                <div className="flex gap-2">
                  {levels.map((l) => (
                    <button
                      key={l}
                      onClick={() => setSev(l)}
                      className={`h-11 flex-1 rounded-xl border text-sm font-semibold ${curSev === l ? 'border-brand bg-brand text-white' : 'border-[#CBD2DA] bg-white'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="flex flex-col gap-2">
              <h2 className="text-[13px] font-bold">
                Vị trí lỗi – Part name <span className="text-bad">*</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {positions.map((p) => (
                  <Chip key={p.id} on={pos === p.name} onClick={() => setPos(p.name)}>
                    {p.name}
                  </Chip>
                ))}
                <Chip on={pos === '__other'} onClick={() => setPos('__other')}>
                  Other
                </Chip>
              </div>
              {pos === '__other' && (
                <input
                  value={otherPos}
                  onChange={(e) => setOtherPos(e.target.value)}
                  placeholder="Gõ tiếng Anh, vd. Armhole"
                  className="h-11 rounded-xl border border-[#CBD2DA] px-3 text-sm"
                />
              )}
            </section>

            <label className="flex flex-col gap-1.5 text-[13px] font-bold">
              Ghi chú
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ghi chú (tiếng Anh), vd. 3 stitches skipped"
                className="h-11 rounded-xl border border-[#CBD2DA] px-3 text-sm font-normal"
              />
            </label>
          </>
        ) : (
          <p className="text-sm text-muted">Bộ ảnh đã gửi duyệt nên không thêm ảnh lỗi được.</p>
        )}
      </div>

      {editable && (
        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3">
          <div className="mx-auto flex max-w-[608px] gap-2.5">
            <button disabled={!canSave} onClick={() => save(true)} className={`${btn.ghost} flex-1`}>
              Lưu &amp; chụp tiếp
            </button>
            <button disabled={!canSave} onClick={() => save(false)} className={`${btn.primary} flex-1`}>
              {busy ? 'Đang lưu…' : 'Lưu'}
            </button>
          </div>
        </div>
      )}
      <Lightbox src={view?.src || null} caption={view?.cap} onClose={() => setView(null)} />
      {cropFile && <CropModal file={cropFile} kind="defect" onCancel={() => setCropFile(null)} onDone={applyCropped} />}
    </main>
  );
}

export default function DefectPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <DefectInner />
    </Suspense>
  );
}
