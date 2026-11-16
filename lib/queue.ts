'use client';
/**
 * Hàng chờ tải ảnh (lưu trong IndexedDB của điện thoại):
 * ảnh được lưu vào máy ngay khi QA bấm "Dùng ảnh", rồi tự tải lên cloud khi có mạng.
 * Đóng app / tắt máy / mất mạng không làm mất ảnh.
 */
import { useEffect, useState } from 'react';
import { isShared } from './config';
import { getOrCreateSet, uploadPhoto } from './photos';
import type { PhotoKind, Severity } from './types';

export interface UploadJob {
  id: string;
  kind: PhotoKind;
  style: string;
  color: string;
  jo: string;
  /** Ảnh lưu dạng ArrayBuffer (iPhone/Zalo hay làm hỏng Blob lưu trong IndexedDB). */
  data?: ArrayBuffer;
  type?: string;
  /** Bản cũ (v1.5–1.8) lưu Blob – vẫn đọc được nếu còn tốt. */
  blob?: Blob;
  width: number;
  height: number;
  defect?: { name: string; severity: Severity; position: string; note: string };
  createdAt: number;
  status: 'pending' | 'uploading' | 'error';
  error?: string;
  tries: number;
}

const DB = 'qa-photo';
const JOBS = 'jobs';
const DRAFTS = 'drafts';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(JOBS)) db.createObjectStore(JOBS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(DRAFTS)) db.createObjectStore(DRAFTS, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r ? (r.result as T) : undefined);
    t.onerror = () => reject(t.error);
  });
}

// ---------- thông báo thay đổi ----------
type Listener = () => void;
const listeners = new Set<Listener>();
const doneListeners = new Set<(job: UploadJob) => void>();
const notify = () => listeners.forEach((l) => l());

export async function listJobs(): Promise<UploadJob[]> {
  const all = (await tx<UploadJob[]>(JOBS, 'readonly', (s) => s.getAll())) || [];
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

/** Lấy ảnh của job dưới dạng Blob (null nếu ảnh trong máy đã hỏng). */
export function jobBlob(job: UploadJob): Blob | null {
  if (job.data && job.data.byteLength) return new Blob([job.data], { type: job.type || 'image/jpeg' });
  if (job.blob && job.blob.size) return job.blob;
  return null;
}

export async function enqueue(job: Omit<UploadJob, 'id' | 'createdAt' | 'status' | 'tries' | 'data' | 'type'> & { blob: Blob }) {
  const { blob, ...rest } = job;
  const data = await blob.arrayBuffer();
  const full: UploadJob = {
    ...rest,
    data,
    type: blob.type || 'image/jpeg',
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    status: 'pending',
    tries: 0,
  };
  await tx(JOBS, 'readwrite', (s) => s.put(full));
  notify();
  void processQueue();
  return full;
}

export async function removeJob(id: string) {
  await tx(JOBS, 'readwrite', (s) => s.delete(id));
  notify();
}

async function putJob(job: UploadJob) {
  await tx(JOBS, 'readwrite', (s) => s.put(job));
  notify();
}

// ---------- xử lý hàng chờ ----------
let running = false;
export async function processQueue() {
  if (running || typeof navigator === 'undefined' || !navigator.onLine) return;
  running = true;
  try {
    const jobs = await listJobs();
    for (const job of jobs) {
      if (!navigator.onLine) break;
      try {
        await putJob({ ...job, status: 'uploading' });
        let blob = jobBlob(job);
        if (blob) {
          try {
            blob = new Blob([await blob.arrayBuffer()], { type: blob.type || 'image/jpeg' });
          } catch {
            blob = null;
          }
        }
        if (!blob || !blob.size) throw new Error('Ảnh lưu trong máy bị hỏng – bấm "Bỏ ảnh" rồi chụp lại.');
        const setId = isShared(job.kind) ? null : (await getOrCreateSet(job.jo, job.color)).id;
        await uploadPhoto({
          img: { blob, width: job.width, height: job.height },
          kind: job.kind,
          style: job.style,
          color: job.color,
          jo: job.jo,
          setId,
          defect: job.defect,
        });
        await removeJob(job.id);
        doneListeners.forEach((l) => l(job));
      } catch (e) {
        await putJob({ ...job, status: 'error', error: (e as Error).message, tries: job.tries + 1 });
      }
    }
  } finally {
    running = false;
  }
}

let started = false;
function startWorker() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => void processQueue());
  setInterval(() => void processQueue(), 15000);
  window.addEventListener('beforeunload', (e) => {
    if (pendingCount > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  void processQueue();
}

let pendingCount = 0;

/** Hook: danh sách ảnh đang chờ tải + gọi lại khi 1 ảnh tải xong. */
export function useQueue(onDone?: (job: UploadJob) => void) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  useEffect(() => {
    startWorker();
    let alive = true;
    const refresh = () =>
      listJobs().then((j) => {
        pendingCount = j.length;
        if (alive) setJobs(j);
      });
    listeners.add(refresh);
    refresh();
    return () => {
      alive = false;
      listeners.delete(refresh);
    };
  }, []);
  useEffect(() => {
    if (!onDone) return;
    doneListeners.add(onDone);
    return () => {
      doneListeners.delete(onDone);
    };
  }, [onDone]);
  return { jobs, retry: () => void processQueue() };
}

// ---------- nháp form (ảnh lỗi đang điền dở) ----------
export interface Draft {
  key: string;
  data: Record<string, unknown>;
  blob?: Blob;
  width?: number;
  height?: number;
  savedAt: number;
}

export async function saveDraft(d: Omit<Draft, 'savedAt'>) {
  await tx(DRAFTS, 'readwrite', (s) => s.put({ ...d, savedAt: Date.now() }));
}

export async function loadDraft(key: string): Promise<Draft | undefined> {
  return tx<Draft>(DRAFTS, 'readonly', (s) => s.get(key));
}

export async function clearDraft(key: string) {
  await tx(DRAFTS, 'readwrite', (s) => s.delete(key));
}
