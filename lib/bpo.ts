import { BPO_ALERT_DAYS, BPO_SEND_DAYS } from './config';
import type { SetStatus } from './types';

/** Số ngày từ hôm nay đến ngày d (yyyy-mm-dd), theo giờ máy. */
export function daysUntil(d: string | null): number | null {
  if (!d) return null;
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  const target = new Date(y, m - 1, day).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86400000);
}

export interface BpoAlert {
  level: 'late' | 'today' | 'soon';
  label: string;
  daysToSend: number;
}

/** Cảnh báo khi còn ≤ BPO_ALERT_DAYS ngày tới BPO mà bộ ảnh chưa được duyệt. */
export function bpoAlert(bpo: string | null, status: SetStatus): BpoAlert | null {
  if (status === 'approved' || status === 'archived') return null;
  const d = daysUntil(bpo);
  if (d === null || d > BPO_ALERT_DAYS) return null;
  const send = d - BPO_SEND_DAYS;
  if (send < 0) return { level: 'late', label: `Quá hạn gửi buyer ${-send} ngày`, daysToSend: send };
  if (send === 0) return { level: 'today', label: 'Hôm nay phải gửi buyer', daysToSend: 0 };
  return { level: 'soon', label: `Còn ${send} ngày đến hạn gửi buyer`, daysToSend: send };
}

export const ALERT_CLS: Record<BpoAlert['level'], string> = {
  late: 'bg-bad text-white',
  today: 'bg-bad-soft text-bad',
  soon: 'bg-warn-soft text-warn',
};
