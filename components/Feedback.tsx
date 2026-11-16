'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { UNDO_SECONDS } from '@/lib/config';
import type { UploadJob } from '@/lib/queue';

/** Trạng thái lưu: đã lưu cloud / đang chờ tải / lỗi. */
export function QueueBadge({ jobs, onRetry }: { jobs: UploadJob[]; onRetry: () => void }) {
  const err = jobs.filter((j) => j.status === 'error').length;
  if (!jobs.length)
    return <span className="whitespace-nowrap rounded-full bg-ok-soft px-2.5 py-1 text-[11px] font-semibold text-ok">● Đã lưu</span>;
  if (err)
    return (
      <button onClick={onRetry} className="whitespace-nowrap rounded-full bg-bad-soft px-2.5 py-1 text-[11px] font-semibold text-bad">
        ● {err} lỗi – Thử lại
      </button>
    );
  return <span className="whitespace-nowrap rounded-full bg-warn-soft px-2.5 py-1 text-[11px] font-semibold text-warn">● Chờ tải {jobs.length} ảnh</span>;
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

/** Xóa có hoàn tác: ẩn ngay, chỉ xóa thật sau UNDO_SECONDS giây (hoặc khi rời trang). */
export function useUndoDelete<T extends { id: number }>(doDelete: (items: T[]) => Promise<void>, onError: (msg: string) => void) {
  const [pending, setPending] = useState<T[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<T[]>([]);
  const del = useRef(doDelete);
  del.current = doDelete;

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const items = pendingRef.current;
    pendingRef.current = [];
    setPending([]);
    if (items.length) del.current(items).catch((e) => onError((e as Error).message));
  }, [onError]);

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
    pendingRef.current = [];
    setPending([]);
  }, []);

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
