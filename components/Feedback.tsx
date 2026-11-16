'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { UNDO_SECONDS } from '@/lib/config';
import { jobBlob, removeJob, type UploadJob } from '@/lib/queue';
import { KIND_INFO } from '@/lib/config';

/** Trạng thái lưu: đã lưu cloud / đang chờ tải / lỗi. Bấm vào để xem chi tiết, thử lại hoặc bỏ ảnh lỗi. */
export function QueueBadge({ jobs, onRetry }: { jobs: UploadJob[]; onRetry: () => void }) {
  const [open, setOpen] = useState(false);
  const err = jobs.filter((j) => j.status === 'error').length;
  const badge = !jobs.length ? (
    <span className="whitespace-nowrap rounded-full bg-ok-soft px-2.5 py-1 text-[11px] font-semibold text-ok">● Đã lưu</span>
  ) : err ? (
    <button onClick={() => setOpen(true)} className="whitespace-nowrap rounded-full bg-bad-soft px-2.5 py-1 text-[11px] font-semibold text-bad">
      ● {err} lỗi – Xem
    </button>
  ) : (
    <button onClick={() => setOpen(true)} className="whitespace-nowrap rounded-full bg-warn-soft px-2.5 py-1 text-[11px] font-semibold text-warn">
      ● Chờ tải {jobs.length} ảnh
    </button>
  );
  return (
    <>
      {badge}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50" role="dialog" aria-modal="true">
          <div className="flex max-h-[80vh] w-full max-w-[640px] flex-col gap-3 overflow-auto rounded-t-2xl bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] text-ink">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Ảnh chờ tải lên ({jobs.length})</h2>
              <button onClick={() => setOpen(false)} className="h-10 px-3 text-sm text-muted">
                Đóng
              </button>
            </div>
            {jobs.length === 0 && <p className="text-sm text-ok">Tất cả ảnh đã lưu lên cloud.</p>}
            {jobs.map((j) => (
              <JobRow key={j.id} job={j} />
            ))}
            {jobs.length > 0 && (
              <button onClick={onRetry} className="h-12 rounded-xl bg-brand text-sm font-semibold text-white">
                Thử tải lại tất cả
              </button>
            )}
            <p className="text-[11px] text-muted">
              Nếu lỗi lặp lại: kiểm tra mạng, hoặc mở app bằng Safari/Chrome (không mở trong Zalo/Messenger) rồi chụp lại ảnh lỗi.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function JobRow({ job }: { job: UploadJob }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const b = jobBlob(job);
    if (!b) return;
    const u = URL.createObjectURL(b);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [job]);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line p-2">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#EEF0F3] text-[10px] text-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : 'ảnh hỏng'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold">
          {KIND_INFO[job.kind].name} · {job.color}
        </div>
        <div className={`text-[11px] ${job.status === 'error' ? 'text-bad' : 'text-muted'}`}>
          {job.status === 'error' ? job.error || 'Lỗi tải lên' : job.status === 'uploading' ? 'Đang tải lên…' : 'Chờ tải lên'}
          {job.tries ? ` · đã thử ${job.tries} lần` : ''}
        </div>
      </div>
      <button onClick={() => void removeJob(job.id)} className="h-10 shrink-0 rounded-lg border border-[#F1C4C4] px-3 text-xs font-semibold text-bad">
        Bỏ ảnh
      </button>
    </div>
  );
}

/** Hộp xác nhận trong app (thay window.confirm – một số trình duyệt như Zalo chặn confirm). */
export function ConfirmDialog({
  open,
  title,
  body,
  okText = 'Đồng ý',
  cancelText = 'Hủy',
  danger,
  onOk,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  okText?: string;
  cancelText?: string;
  danger?: boolean;
  onOk: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-3 sm:items-center" role="dialog" aria-modal="true">
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-white p-5 text-ink">
        <h2 className="text-base font-bold">{title}</h2>
        {body && <div className="text-sm text-muted">{body}</div>}
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="h-12 flex-1 rounded-xl border border-[#CBD2DA] text-sm font-semibold">
            {cancelText}
          </button>
          <button onClick={onOk} className={`h-12 flex-1 rounded-xl text-sm font-semibold text-white ${danger ? 'bg-bad' : 'bg-brand'}`}>
            {okText}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Xóa có hoàn tác: ẩn ngay, chỉ xóa thật sau UNDO_SECONDS giây (hoặc khi rời trang).
 * Lưu ý (sửa lỗi v2.0): mọi hàm đều ổn định (không đổi giữa các lần render) và chỉ setState khi thật sự có thay đổi –
 * bản cũ tạo vòng render vô hạn làm Safari "đơ" nút chuyển trang.
 */
export function useUndoDelete<T extends { id: number }>(doDelete: (items: T[]) => Promise<void>, onError: (msg: string) => void) {
  const [pending, setPending] = useState<T[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<T[]>([]);
  const del = useRef(doDelete);
  const errRef = useRef(onError);
  del.current = doDelete;
  errRef.current = onError;

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const items = pendingRef.current;
    if (!items.length) return;
    pendingRef.current = [];
    setPending([]);
    del.current(items).catch((e) => errRef.current((e as Error).message));
  }, []);

  const remove = useCallback(
    (item: T) => {
      pendingRef.current = [...pendingRef.current, item];
      setPending(pendingRef.current);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, UNDO_SECONDS * 1000);
    },
    [flush],
  );

  const undo = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!pendingRef.current.length) return;
    pendingRef.current = [];
    setPending([]);
  }, []);

  // Rời trang khi còn ảnh chờ xóa → xóa luôn (chỉ chạy 1 lần lúc rời trang)
  useEffect(() => () => flush(), [flush]);

  const hidden = new Set(pending.map((p) => p.id));
  return { remove, undo, flush, pending, isHidden: (id: number) => hidden.has(id) };
}

export function UndoBar({ count, onUndo }: { count: number; onUndo: () => void }) {
  if (!count) return null;
  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+92px)] z-40 mx-auto flex max-w-[600px] items-center justify-between rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-lg">
      <span>Đã xóa {count} ảnh</span>
      <button onClick={onUndo} className="h-9 rounded-lg px-3 font-semibold text-[#9CC2FF]">
        Hoàn tác
      </button>
    </div>
  );
}
