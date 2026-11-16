import type { PhotoKind, SetStatus } from './types';

export const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024; // Supabase free: 1 GB
export const RETENTION_MONTHS = 6;
export const DEFECT_PHOTO_HINT = 10; // nhắc khi vượt số ảnh lỗi / lot × màu
export const MAX_EDGE = 1600; // px, cạnh dài sau khi nén
export const JPEG_QUALITY = 0.85;
export const BLUR_THRESHOLD = 60; // thấp hơn = nghi mờ
export const DARK_THRESHOLD = 55; // độ sáng trung bình thấp hơn = nghi tối

export const STATUS_INFO: Record<SetStatus, { label: string; cls: string }> = {
  draft: { label: 'Nháp', cls: 'bg-warn-soft text-warn' },
  submitted: { label: 'Chờ duyệt', cls: 'bg-brand-soft text-brand-dark' },
  approved: { label: 'Đã duyệt', cls: 'bg-ok-soft text-ok' },
  rejected: { label: 'Bị trả lại', cls: 'bg-bad-soft text-bad' },
  archived: { label: 'Đã lưu trữ', cls: 'bg-line text-muted' },
};

export const KIND_INFO: Record<PhotoKind, { name: string; hint: string }> = {
  label: {
    name: 'Mác sườn',
    hint: 'Chụp ngang, mác nằm giữa khung, đọc rõ style và mã màu. Dùng cho cột ① ② báo cáo IE và Final report.',
  },
  fold: {
    name: 'Gập gói',
    hint: 'Áo đã gập trong túi PE, thấy rõ thẻ bài. Cột ③ IE. Dùng chung mọi lot cùng màu.',
  },
  hangtag: { name: 'Thẻ bài', hint: 'Chụp thẳng mặt thẻ, đọc rõ mã vạch. Dùng chung mọi lot cùng màu.' },
  front: { name: 'Thân trước', hint: 'Trải phẳng, thấy toàn bộ thân trước. Dùng chung cho mọi lot cùng màu.' },
  defect: { name: 'Ảnh lỗi', hint: 'Chụp gần, lỗi ở giữa khung.' },
  carton: { name: 'Mặt thùng (có tem)', hint: 'Chụp 1 ảnh mặt thùng thấy rõ tem thùng. Dùng chung mọi lot cùng màu (hàng Men).' },
  carton_face: { name: 'Mặt thùng', hint: 'Chụp cả mặt thùng có ký mã hiệu.' },
  carton_label: { name: 'Nhãn thùng', hint: 'Chụp thẳng, đọc rõ chữ trên nhãn thùng.' },
};

export const SINGLE_KINDS: PhotoKind[] = ['label', 'fold', 'hangtag', 'front', 'carton', 'carton_face', 'carton_label'];
/** Ảnh dùng chung cho mọi lot cùng style × màu (lưu với set_id = null). */
export const SHARED_KINDS: PhotoKind[] = ['front', 'fold', 'hangtag', 'carton'];
export const isShared = (k: PhotoKind) => SHARED_KINDS.includes(k);
export const UNDO_SECONDS = 10;

export const BPO_ALERT_DAYS = 5; // bắt đầu cảnh báo khi còn ≤ 5 ngày tới BPO date
export const BPO_SEND_DAYS = 2; // QA phải gửi báo cáo cho buyer trước BPO date 2 ngày

export const APP_VERSION = 'v2.0';
