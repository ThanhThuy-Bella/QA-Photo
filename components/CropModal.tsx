'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { autoRect, compressCanvas, cropCanvas, fileToCanvas, qualityWarning, rotateCanvas, type Compressed, type Rect } from '@/lib/image';
import type { PhotoKind } from '@/lib/types';
import { KIND_INFO } from '@/lib/config';

type Drag = { mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'; px: number; py: number; r: Rect } | null;

const MIN = 40; // px trên màn hình

/** Màn hình cắt ảnh: app đặt sẵn khung, QA kéo chỉnh / xoay 90° rồi bấm "Dùng ảnh". */
export function CropModal({
  file,
  kind,
  onDone,
  onCancel,
}: {
  file: File;
  kind: PhotoKind;
  onDone: (img: Compressed) => void;
  onCancel: () => void;
}) {
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null); // theo pixel của src
  const [box, setBox] = useState({ w: 300, h: 300, scale: 1 });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag>(null);

  useEffect(() => {
    let alive = true;
    fileToCanvas(file)
      .then((c) => {
        if (!alive) return;
        setSrc(c);
        setRect(autoRect(c, kind));
      })
      .catch((e) => setErr((e as Error).message));
    return () => {
      alive = false;
    };
  }, [file, kind]);

  useLayoutEffect(() => {
    if (!src || !holder.current) return;
    const maxW = holder.current.clientWidth;
    const maxH = Math.max(240, window.innerHeight - 260);
    const scale = Math.min(maxW / src.width, maxH / src.height);
    const w = Math.round(src.width * scale);
    const h = Math.round(src.height * scale);
    setBox({ w, h, scale });
    const v = view.current!;
    v.width = w;
    v.height = h;
    v.getContext('2d')!.drawImage(src, 0, 0, w, h);
  }, [src]);

  const rotate = () => {
    if (!src) return;
    const c = rotateCanvas(src, true);
    setSrc(c);
    setRect(autoRect(c, kind));
  };

  const onDown = (mode: NonNullable<Drag>['mode']) => (e: React.PointerEvent) => {
    if (!rect) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, px: e.clientX, py: e.clientY, r: { ...rect } };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !src) return;
    const dx = (e.clientX - d.px) / box.scale;
    const dy = (e.clientY - d.py) / box.scale;
    const min = MIN / box.scale;
    let { x, y, w, h } = d.r;
    if (d.mode === 'move') {
      x = Math.min(Math.max(0, x + dx), src.width - w);
      y = Math.min(Math.max(0, y + dy), src.height - h);
    } else {
      if (d.mode.includes('w')) {
        const nx = Math.min(Math.max(0, x + dx), x + w - min);
        w = w + (x - nx);
        x = nx;
      }
      if (d.mode.includes('e')) w = Math.min(Math.max(min, w + dx), src.width - x);
      if (d.mode.includes('n')) {
        const ny = Math.min(Math.max(0, y + dy), y + h - min);
        h = h + (y - ny);
        y = ny;
      }
      if (d.mode.includes('s')) h = Math.min(Math.max(min, h + dy), src.height - y);
    }
    setRect({ x, y, w, h });
  };

  const onUp = () => {
    drag.current = null;
  };

  const finish = async (useFull: boolean) => {
    if (!src || !rect) return;
    setBusy(true);
    try {
      const out = await compressCanvas(useFull ? src : cropCanvas(src, rect));
      const warn = qualityWarning(out);
      if (warn && !window.confirm(`${warn}\nVẫn dùng ảnh này? (Bấm Hủy để chụp lại)`)) {
        onCancel();
        return;
      }
      onDone(out);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const r = rect ? { left: rect.x * box.scale, top: rect.y * box.scale, width: rect.w * box.scale, height: rect.h * box.scale } : null;
  const handle = 'absolute h-7 w-7 rounded-full border-[3px] border-white bg-brand touch-none';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink text-white" role="dialog" aria-modal="true" aria-label="Cắt ảnh">
      <div className="flex items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top)+12px)]">
        <div>
          <div className="font-semibold">Cắt ảnh · {KIND_INFO[kind].name}</div>
          <div className="text-xs text-[#C9D1DB]">Kéo khung hoặc 4 góc cho vừa vật thể</div>
        </div>
        <button onClick={onCancel} className="h-11 rounded-lg px-3 text-sm text-[#C9D1DB]">
          Hủy
        </button>
      </div>

      <div ref={holder} className="flex flex-1 items-center justify-center overflow-hidden px-4">
        {err ? (
          <p className="max-w-sm text-center text-sm text-[#FBE3E3]">{err}</p>
        ) : !src ? (
          <p className="text-sm text-[#C9D1DB]">Đang mở ảnh…</p>
        ) : (
          <div className="relative select-none" style={{ width: box.w, height: box.h }} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <canvas ref={view} className="block" style={{ width: box.w, height: box.h }} />
            {r && (
              <div
                className="absolute touch-none border-2 border-white"
                style={{ ...r, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)', cursor: 'move' }}
                onPointerDown={onDown('move')}
              >
                <span className={handle} style={{ left: -14, top: -14 }} onPointerDown={onDown('nw')} />
                <span className={handle} style={{ right: -14, top: -14 }} onPointerDown={onDown('ne')} />
                <span className={handle} style={{ left: -14, bottom: -14 }} onPointerDown={onDown('sw')} />
                <span className={handle} style={{ right: -14, bottom: -14 }} onPointerDown={onDown('se')} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3">
        <div className="flex gap-2">
          <button disabled={!src || busy} onClick={rotate} className="h-11 flex-1 rounded-xl border border-[#3A4654] text-sm disabled:opacity-40">
            Xoay 90°
          </button>
          <button disabled={!src || busy} onClick={() => src && setRect(autoRect(src, kind))} className="h-11 flex-1 rounded-xl border border-[#3A4654] text-sm disabled:opacity-40">
            Tự cắt lại
          </button>
          <button disabled={!src || busy} onClick={() => finish(true)} className="h-11 flex-1 rounded-xl border border-[#3A4654] text-sm disabled:opacity-40">
            Không cắt
          </button>
        </div>
        <button disabled={!src || busy} onClick={() => finish(false)} className="h-12 rounded-xl bg-brand text-[15px] font-semibold disabled:opacity-40">
          {busy ? 'Đang xử lý…' : 'Dùng ảnh'}
        </button>
      </div>
    </div>
  );
}
