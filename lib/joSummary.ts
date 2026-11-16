import type { JoColor, PhotoSet, SetStatus } from './types';

export interface ColorSummary {
  color: string;
  set?: PhotoSet;
  status: SetStatus;
  ieDone: number; // 0..2 (mác + gập gói)
}

export interface JoSummary {
  jo: string;
  lot: string;
  go: string | null;
  style: string;
  category: 'Men' | 'Ladies';
  sewStart: string | null;
  bpo: string | null;
  inRecap: boolean;
  colors: ColorSummary[];
  status: SetStatus;
  ieDone: number;
  ieTotal: number;
}

export function aggregateStatus(list: SetStatus[]): SetStatus {
  if (list.every((s) => s === 'archived')) return 'archived';
  const live = list.filter((s) => s !== 'archived');
  if (live.some((s) => s === 'rejected')) return 'rejected';
  if (live.every((s) => s === 'approved')) return 'approved';
  if (live.every((s) => s === 'approved' || s === 'submitted')) return 'submitted';
  return 'draft';
}

export function summarize(
  rows: JoColor[],
  sets: PhotoSet[],
  iePhotos: { set_id: number | null; kind: string; cust_style?: string; color_code?: string }[],
): JoSummary[] {
  const sharedFold = new Set(
    iePhotos.filter((p) => p.set_id === null && p.kind === 'fold').map((p) => `${p.cust_style}|${p.color_code}`),
  );
  const setMap = new Map(sets.map((s) => [`${s.jo_no}|${s.color_code}`, s]));
  const ieCount = new Map<number, Set<string>>();
  iePhotos.forEach((p) => {
    if (!p.set_id) return;
    if (!ieCount.has(p.set_id)) ieCount.set(p.set_id, new Set());
    ieCount.get(p.set_id)!.add(p.kind);
  });
  const byJo = new Map<string, JoSummary>();
  rows.forEach((r) => {
    const set = setMap.get(`${r.jo_no}|${r.color_code}`);
    if (!r.in_recap && !set) return;
    if (!byJo.has(r.jo_no)) {
      byJo.set(r.jo_no, {
        jo: r.jo_no,
        lot: r.lot,
        go: r.go_no,
        style: r.cust_style,
        category: r.category,
        sewStart: r.sew_start,
        bpo: r.bpo_date,
        inRecap: r.in_recap,
        colors: [],
        status: 'draft',
        ieDone: 0,
        ieTotal: 0,
      });
    }
    const j = byJo.get(r.jo_no)!;
    j.inRecap = j.inRecap || r.in_recap;
    const own = set ? ieCount.get(set.id) : undefined;
    const done = Number(!!own?.has('label')) + Number(!!own?.has('fold') || sharedFold.has(`${r.cust_style}|${r.color_code}`));
    j.colors.push({ color: r.color_code, set, status: set?.status || 'draft', ieDone: done });
  });
  const out = Array.from(byJo.values());
  out.forEach((j) => {
    j.colors.sort((a, b) => a.color.localeCompare(b.color));
    j.status = aggregateStatus(j.colors.map((c) => c.status));
    j.ieDone = j.colors.reduce((n, c) => n + c.ieDone, 0);
    j.ieTotal = j.colors.length * 2;
  });
  return out.sort((a, b) => (a.sewStart || '9999').localeCompare(b.sewStart || '9999') || a.jo.localeCompare(b.jo));
}
