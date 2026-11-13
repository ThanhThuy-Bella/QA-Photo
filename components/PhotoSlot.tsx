'use client';
import { useRef } from 'react';

interface Props {
  title: string;
  hint: string;
  badge?: string;
  url?: string;
  editable: boolean;
  busy?: boolean;
  required?: boolean;
  onPick: (file: File) => void;
  onDelete?: () => void;
  onView?: () => void;
}

export function CameraIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export function AlbumIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m21 16-5-5-9 9" />
    </svg>
  );
}

/** 2 input ẩn: chụp trực tiếp (camera sau) và chọn từ album điện thoại. */
export function usePickers(onPick: (file: File) => void) {
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const take = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onPick(f);
  };
  const inputs = (
    <>
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={take} />
      <input ref={lib} type="file" accept="image/*" className="hidden" onChange={take} />
    </>
  );
  return { inputs, openCamera: () => cam.current?.click(), openAlbum: () => lib.current?.click() };
}

export function PhotoSlot({ title, hint, badge, url, editable, busy, required, onPick, onDelete, onView }: Props) {
  const { inputs, openCamera, openAlbum } = usePickers(onPick);
  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border bg-white ${url ? 'border-[#BFE3CB]' : 'border-line'}`}>
      {inputs}
      {url ? (
        <button onClick={onView} className="relative h-[120px] bg-[#EEF0F3]" aria-label={`Xem ảnh ${title}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={title} className="h-full w-full object-cover" />
          {busy && <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs font-semibold">Đang lưu…</span>}
        </button>
      ) : (
        <div className="flex h-[120px] flex-col items-center justify-center gap-1 bg-[#F0F2F5] text-[12px] text-muted">
          {busy ? 'Đang lưu…' : 'Chưa có ảnh'}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold">{title}</span>
          {required && !url && <span className="text-xs text-bad">*</span>}
        </div>
        {badge && <span className="self-start rounded-md bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand-dark">{badge}</span>}
        <p className="text-[11px] leading-snug text-muted">{hint}</p>
        {editable && (
          <div className="mt-auto flex flex-col gap-1.5 pt-1">
            <div className="flex gap-1.5">
              <button
                disabled={busy}
                onClick={openCamera}
                className={`flex h-10 flex-1 items-center justify-center gap-1 rounded-lg text-xs font-semibold disabled:opacity-40 ${
                  url ? 'border border-[#CBD2DA] text-ink' : 'bg-brand text-white'
                }`}
              >
                <CameraIcon size={16} />
                {url ? 'Chụp lại' : 'Chụp'}
              </button>
              <button
                disabled={busy}
                onClick={openAlbum}
                className="flex h-10 flex-1 items-center justify-center gap-1 rounded-lg border border-[#CBD2DA] text-xs font-semibold text-ink disabled:opacity-40"
              >
                <AlbumIcon size={16} />
                Album
              </button>
            </div>
            {url && (
              <button disabled={busy} onClick={onDelete} className="h-9 rounded-lg border border-[#F1C4C4] text-xs text-bad disabled:opacity-40">
                Xóa ảnh
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
