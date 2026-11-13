'use client';
export function Lightbox({ src, caption, onClose }: { src: string | null; caption?: string; onClose: () => void }) {
  if (!src) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={onClose} role="dialog" aria-modal="true">
      <div className="flex items-center justify-between p-3 pt-[calc(env(safe-area-inset-top)+12px)] text-sm text-white">
        <span>{caption}</span>
        <button className="h-11 rounded-lg px-4 font-semibold" onClick={onClose}>
          Đóng
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={caption || 'Ảnh'} className="max-h-full max-w-full object-contain" />
      </div>
    </div>
  );
}
